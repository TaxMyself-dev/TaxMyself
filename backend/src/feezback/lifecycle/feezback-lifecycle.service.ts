import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, In, LessThanOrEqual, Raw } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/user.entity';
import { Subscription } from '../../billing/entities/subscription.entity';
import { SubscriptionPlan } from '../../billing/entities/subscription-plan.entity';
import { BillingEvent } from '../../billing/entities/billing-event.entity';
import { BillingEventType } from '../../billing/enums/billing.enums';
import { OpenBankingEnrollmentService } from '../../billing/services/open-banking-enrollment.service';
import { SubscriptionAccessService } from '../../billing/services/subscription-access.service';
import { usesSyntheticOpenBanking } from '../../demo-data/profiles';
import { UserSourceSyncState } from '../../transactions/user-source-sync-state.entity';
import { hasLocalDemoData } from './feezback-local-data';
import { FeezbackApiService } from '../api/feezback-api.service';
import { FeezbackDisconnectionService } from '../feezback-disconnection.service';
import { feezbackSub } from '../utils/feezback-identity';
import {
  FeezbackLifecycle,
  ProviderEvidence,
} from './feezback-lifecycle.entity';
import {
  bankingEntitlement,
  emptyEvidence,
  identityUnits,
  terminalStatuses,
} from './feezback-lifecycle.policy';

export async function enqueueLifecycle(
  manager: EntityManager,
  firebaseId: string,
  manual = false,
  actor?: string,
) {
  if (process.env.FEEZBACK_LIFECYCLE_ENABLED !== 'true') return;
  await manager.query(
    `INSERT INTO feezback_lifecycle (firebase_id,next_check_at,generation,attempts,disconnect_requested,requested_by,requested_at)
    VALUES (?,UTC_TIMESTAMP(),1,0,?,?,?) ON DUPLICATE KEY UPDATE next_check_at=UTC_TIMESTAMP(),generation=generation+1,
    disconnect_requested=IF(VALUES(disconnect_requested),1,disconnect_requested),
    requested_by=IF(VALUES(disconnect_requested),VALUES(requested_by),requested_by),
    requested_at=IF(VALUES(disconnect_requested),VALUES(requested_at),requested_at)`,
    [firebaseId, manual ? 1 : 0, actor ?? null, manual ? new Date() : null],
  );
}

@Injectable()
export class FeezbackLifecycleService {
  private readonly logger = new Logger(FeezbackLifecycleService.name);
  private draining = false;
  constructor(
    private readonly db: DataSource,
    private readonly api: FeezbackApiService,
    private readonly disconnection: FeezbackDisconnectionService,
    private readonly enrollment: OpenBankingEnrollmentService,
    private readonly access: SubscriptionAccessService,
  ) {}
  get enabled() {
    return process.env.FEEZBACK_LIFECYCLE_ENABLED === 'true';
  }
  get automatic() {
    return (
      this.enabled && process.env.FEEZBACK_LIFECYCLE_AUTODISCONNECT === 'true'
    );
  }
  private entitlementKey(
    value: Awaited<ReturnType<FeezbackLifecycleService['entitlement']>>,
  ) {
    return JSON.stringify([
      value.eligible,
      value.reason,
      value.until,
      value.plan,
      value.subscriptionStatus,
    ]);
  }

  async entitlement(
    firebaseId: string,
    manager: EntityManager = this.db.manager,
  ) {
    const sub = await manager.findOne(Subscription, { where: { firebaseId } });
    const plan = sub?.planId
      ? await manager.findOne(SubscriptionPlan, { where: { id: sub.planId } })
      : null;
    const event = sub ? await this.enrollment.latest(sub.id, manager) : null;
    return {
      ...bankingEntitlement(
        sub,
        plan,
        event?.metadata ?? null,
        sub ? this.access.resolveModulesAccess(sub, plan) : [],
      ),
      plan: plan?.name ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  }

  async list(page = 0, limit = 50) {
    if (!this.enabled)
      return { enabled: false, automatic: false, rows: [], total: 0 };
    const [users, total] = await this.db.getRepository(User).findAndCount({
      order: { index: 'ASC' },
      skip: page * limit,
      take: limit,
    });
    if (!users.length)
      return { enabled: true, automatic: this.automatic, rows: [], total };
    const ids = users.map((user) => user.firebaseId);
    const subscriptions = await this.db.manager.find(Subscription, {
      where: { firebaseId: In(ids) },
    });
    const planIds = [
      ...new Set(
        subscriptions
          .map((sub) => sub.planId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const plans = planIds.length
      ? await this.db.manager.find(SubscriptionPlan, {
          where: { id: In(planIds) },
        })
      : [];
    const states = await this.db.manager.find(FeezbackLifecycle, {
      where: { firebaseId: In(ids) },
    });
    const localLinks = await this.db.manager.find(UserSourceSyncState, {
      select: {
        userId: true,
        consentId: true,
        resourceId: true,
        consentVerifiedAt: true,
      },
      where: { userId: In(ids) },
    });
    const subIds = subscriptions.map((sub) => sub.id);
    const events = subIds.length
      ? await this.db
          .getRepository(BillingEvent)
          .createQueryBuilder('event')
          .where('event.subscriptionId IN (:...subIds)', { subIds })
          .andWhere('event.eventType = :type', {
            type: BillingEventType.PLAN_CHANGE_REQUESTED,
          })
          .andWhere(
            "JSON_UNQUOTE(JSON_EXTRACT(event.metadata, '$.policy')) = :policy",
            { policy: 'OPEN_BANKING_TRIAL_V1' },
          )
          .andWhere(
            `event.id = (SELECT MAX(latest.id) FROM billing_event latest WHERE latest.subscription_id = event.subscription_id
        AND latest.event_type = :type AND JSON_UNQUOTE(JSON_EXTRACT(latest.metadata, '$.policy')) = :policy)`,
          )
          .getMany()
      : [];
    const rows = [];
    for (const user of users) {
      const state = states.find(
        (state) => state.firebaseId === user.firebaseId,
      );
      const sub =
        subscriptions.find((sub) => sub.firebaseId === user.firebaseId) ?? null;
      const plan = plans.find((plan) => plan.id === sub?.planId) ?? null;
      const event = events.find((event) => event.subscriptionId === sub?.id);
      const entitlement = {
        ...bankingEntitlement(
          sub,
          plan,
          event?.metadata ?? null,
          sub ? this.access.resolveModulesAccess(sub, plan) : [],
        ),
        plan: plan?.name ?? null,
        subscriptionStatus: sub?.status ?? null,
      };
      const evidence = state?.evidence ?? emptyEvidence();
      const primaryUnits = identityUnits(evidence.primary),
        spouseUnits = identityUnits(evidence.spouse);
      const stale = Object.values(evidence).some(
        (role) =>
          !role.checkedAt ||
          Date.now() - new Date(role.checkedAt).getTime() > 26 * 3600_000,
      );
      const synthetic = usesSyntheticOpenBanking(user.email);
      rows.push({
        firebaseId: user.firebaseId,
        name: [user.fName, user.lName].filter(Boolean).join(' '),
        email: user.email,
        hasOpenBanking: user.hasOpenBanking,
        localDataIsDemo: hasLocalDemoData(
          user.email,
          localLinks.filter((link) => link.userId === user.firebaseId),
        ),
        synthetic,
        entitlement,
        evidence,
        primaryUnits,
        spouseUnits,
        expectedUnits:
          primaryUnits === null || spouseUnits === null
            ? null
            : primaryUnits + spouseUnits,
        stale,
        mismatch:
          !synthetic &&
          entitlement.eligible === false &&
          (primaryUnits === 1 || spouseUnits === 1),
        pending: !!state && state.nextCheckAt <= new Date(),
        disconnectRequested: state?.disconnectRequested ?? false,
        lastAction: state?.lastAction ?? null,
        lastError: state?.lastError ?? null,
        requestedAt: state?.requestedAt ?? null,
      });
    }
    return { enabled: true, automatic: this.automatic, rows, total };
  }

  async request(firebaseId: string, manual: boolean, actor: string) {
    if (!this.enabled)
      throw new BadRequestException('Feezback control is disabled');
    const user = await this.db.manager.findOne(User, { where: { firebaseId } });
    if (!user || usesSyntheticOpenBanking(user.email))
      throw new BadRequestException('User is missing or synthetic');
    await enqueueLifecycle(this.db.manager, firebaseId, manual, actor);
    return { queued: true };
  }

  @Cron('0 */10 * * * *', {
    name: 'feezbackLifecycleSeed',
    timeZone: 'Asia/Jerusalem',
  })
  async seed() {
    if (!this.enabled) return;
    let after = 0;
    for (;;) {
      const users = await this.db
        .getRepository(User)
        .createQueryBuilder('u')
        .where('u.index > :after', { after })
        .orderBy('u.index')
        .take(100)
        .getMany();
      if (!users.length) return;
      for (const user of users)
        if (!usesSyntheticOpenBanking(user.email)) {
          await this.db.manager.query(
            `INSERT IGNORE INTO feezback_lifecycle (firebase_id,next_check_at,generation,attempts,disconnect_requested)
          VALUES (?,UTC_TIMESTAMP(),0,0,0)`,
            [user.firebaseId],
          );
          const state = await this.db.manager.findOne(FeezbackLifecycle, {
            where: { firebaseId: user.firebaseId },
          });
          if (
            state?.entitlementKey &&
            state.entitlementKey !==
              this.entitlementKey(await this.entitlement(user.firebaseId))
          ) {
            await enqueueLifecycle(this.db.manager, user.firebaseId);
          }
        }
      after = users[users.length - 1].index;
    }
  }

  @Cron('*/30 * * * * *', {
    name: 'feezbackLifecycleWorker',
    timeZone: 'Asia/Jerusalem',
  })
  async drain() {
    if (!this.enabled || this.draining) return;
    this.draining = true;
    try {
      const jobs = await this.db.manager.find(FeezbackLifecycle, {
        where: { nextCheckAt: LessThanOrEqual(new Date()) },
        order: { nextCheckAt: 'ASC' },
        take: 10,
      });
      for (const job of jobs) {
        try {
          await this.run(job);
        } catch {
          this.logger.error(
            'Feezback lifecycle job failed; durable retry remains pending',
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async observe(
    firebaseId: string,
    previous: ProviderEvidence,
  ): Promise<ProviderEvidence> {
    const evidence = JSON.parse(JSON.stringify(previous)) as ProviderEvidence;
    for (const role of ['primary', 'spouse'] as const) {
      try {
        const response = await this.api.getUserConsents(
          feezbackSub(firebaseId, role === 'spouse'),
          true,
        );
        if (
          !Array.isArray(response?.consents) ||
          response.consents.some(
            (c) =>
              typeof c?.resourceId !== 'string' ||
              !c.resourceId.trim() ||
              typeof c?.consentStatus !== 'string',
          )
        )
          throw new Error('Malformed consents');
        evidence[role] = {
          checkedAt: new Date().toISOString(),
          error: null,
          consents: response.consents.map((c) => ({
            id: c.resourceId,
            status: c.consentStatus,
            validUntil: c.validUntil ?? null,
          })),
        };
      } catch {
        evidence[role].error = 'CONSENT_CHECK_FAILED';
      }
    }
    return evidence;
  }

  async run(job: FeezbackLifecycle) {
    const token = randomUUID();
    const repository = this.db.getRepository(FeezbackLifecycle);
    const claimed = await repository
      .createQueryBuilder()
      .update()
      .set({
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 30 * 60_000),
      })
      .where(
        'firebase_id = :id AND generation = :generation AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP())',
        { id: job.firebaseId, generation: job.generation },
      )
      .execute();
    if (!claimed.affected) return;
    let evidence = job.evidence ?? emptyEvidence();
    let lastError: string | null = null,
      lastAction = 'OBSERVED',
      manualPending = job.disconnectRequested;
    let nextBoundary: Date | null = null;
    let entitlementKey: string | null = null;
    try {
      const user = await this.db.manager.findOne(User, {
        where: { firebaseId: job.firebaseId },
      });
      if (!user || usesSyntheticOpenBanking(user.email)) {
        lastAction = 'SKIPPED';
        manualPending = false;
      } else {
        evidence = await this.observe(job.firebaseId, evidence);
        if (Object.values(evidence).some((role) => role.error))
          lastError = 'CONSENT_CHECK_FAILED';
        const entitlement = await this.entitlement(job.firebaseId);
        entitlementKey = this.entitlementKey(entitlement);
        nextBoundary = entitlement.until;
        const hasPermissions = Object.values(evidence).some((role) =>
          role.consents.some(
            (c) => !terminalStatuses.has(c.status.toLowerCase()),
          ),
        );
        if (
          job.disconnectRequested ||
          (this.automatic && entitlement.eligible === false && hasPermissions)
        ) {
          const result = await this.disconnection.disconnect(
            job.firebaseId,
            { scope: 'all' },
            async (proceed) =>
              this.db.transaction(async (manager) => {
                // Serialize renewal/upgrade with the final eligibility decision and termination.
                await manager.findOne(Subscription, {
                  where: { firebaseId: job.firebaseId },
                  lock: { mode: 'pessimistic_write' },
                });
                const freshJob = await manager.findOne(FeezbackLifecycle, {
                  where: { firebaseId: job.firebaseId },
                });
                const current = await this.entitlement(job.firebaseId, manager);
                if (
                  freshJob?.generation !== job.generation ||
                  freshJob?.leaseToken !== token ||
                  (!job.disconnectRequested && current.eligible !== false)
                )
                  return null;
                return proceed();
              }),
          );
          if (result) {
            evidence = await this.observe(job.firebaseId, evidence);
            if (
              result.status !== 'success' ||
              Object.values(evidence).some(
                (role) =>
                  role.error ||
                  role.consents.some(
                    (c) => !terminalStatuses.has(c.status.toLowerCase()),
                  ),
              )
            ) {
              lastError = 'DISCONNECTION_NOT_VERIFIED';
              lastAction = 'DISCONNECT_PENDING';
            } else {
              lastError = null;
              lastAction = 'DISCONNECTED';
              manualPending = false;
            }
          }
        }
      }
    } catch {
      lastError = 'RECONCILIATION_FAILED';
    }
    let delay = lastError
      ? Math.min(6 * 3600_000, 60_000 * 2 ** Math.min(job.attempts, 8))
      : 24 * 3600_000;
    if (!lastError && nextBoundary && nextBoundary.getTime() > Date.now())
      delay = Math.min(
        delay,
        Math.max(1000, nextBoundary.getTime() - Date.now()),
      );
    // A mutation queued during provider I/O wins over this older job.
    await repository.update(
      {
        firebaseId: job.firebaseId,
        leaseToken: token,
        generation: job.generation,
      },
      {
        evidence,
        entitlementKey,
        lastError,
        lastAction,
        disconnectRequested: manualPending,
        attempts: lastError ? job.attempts + 1 : 0,
        nextCheckAt: new Date(Date.now() + delay),
        leaseToken: null,
        leaseUntil: null,
      },
    );
    await repository.update(
      { firebaseId: job.firebaseId, leaseToken: token },
      { leaseToken: null, leaseUntil: null },
    );
  }
}
