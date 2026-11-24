import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { UserIntegration } from '../entities/user-integration.entity';
import { routingSettings } from '../../email-intake/email-routing.policy';
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationSyncStatus,
} from '../enums/integrations.enums';

export interface UpsertIntegrationInput {
  businessNumber?:string;
  firebaseId: string;
  provider: IntegrationProvider;
  /**
   * Provider-side account identifier (Google `sub`). REQUIRED: it is the
   * global identity of the connected account and half of the upsert key
   * UNIQUE(provider, accountId).
   */
  accountId: string;
  connectedAccountId: string;
  accountEmail?: string | null;
  scopes?: string | null;
  expiresAt?: Date | null;
}

/**
 * Persistence layer for user_integrations — connections between a KeepInTax
 * user and an external provider account (Google, Microsoft, ...).
 *
 * Provider-agnostic by design: OAuth flows (Phase B) and provider APIs
 * (Gmail, Drive import — later phases) build on top of this service.
 * Credentials remain in Composio. This service stores only account pointers
 * and mailbox state; legacy token columns stay null.
 */
@Injectable()
export class UserIntegrationsService {
  private readonly logger = new Logger(UserIntegrationsService.name);

  constructor(
    @InjectRepository(UserIntegration)
    private readonly userIntegrationRepo: Repository<UserIntegration>,
  ) {}

  /** All integrations of a user, for the "connected accounts" screen. */
  async findAllForUser(firebaseId: string): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId },
      order: { provider: 'ASC', id: 'ASC' },
    });
  }

  /** All of a user's integrations for one provider (any status), oldest first. */
  async findAllByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId, provider },
      order: { id: 'ASC' },
    });
  }

  /**
   * A user's integrations for one provider that should be VISIBLE in the UI —
   * everything except REVOKED. A REVOKED row is a mailbox the user
   * intentionally disconnected: it must vanish from the settings screen and
   * from the frontend status endpoints. EXPIRED rows stay visible so the user
   * can see the failure and reconnect.
   */
  async findAllVisibleByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: [
        { firebaseId, provider, status: Not(IntegrationStatus.REVOKED) },
        { firebaseId, provider, remoteDisconnectPending: true },
      ],
      order: { id: 'ASC' },
    });
  }

  /** A user's ACTIVE integrations for one provider, oldest first. */
  async findAllActiveByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId, provider, status: IntegrationStatus.ACTIVE },
      order: { id: 'ASC' },
    });
  }

  /** The single integration for a provider account, keyed on the upsert key. */
  async findByProviderAndAccountId(
    provider: IntegrationProvider,
    accountId: string,
  ): Promise<UserIntegration | null> {
    return this.userIntegrationRepo.findOne({ where: { provider, accountId } });
  }

  /**
   * Loads an integration by id and asserts it belongs to firebaseId. Throws
   * 404 both when the row is missing and when it is owned by another user —
   * a foreign id must not leak that the integration exists.
   */
  async findOwnedByIdOrThrow(
    integrationId: number,
    firebaseId: string,
  ): Promise<UserIntegration> {
    const integration = await this.userIntegrationRepo.findOne({
      where: { id: integrationId },
    });
    if (!integration || integration.firebaseId !== firebaseId) {
      throw new NotFoundException('Integration not found');
    }
    return integration;
  }

  /**
   * Connects (or reconnects) a provider account, keyed on UNIQUE(provider,
   * accountId) so a single user can hold many accounts of the same provider.
   *
   * - No existing row → create a new integration for this user (ACTIVE).
   * - Existing row owned by the SAME user → replace the managed connection and
   *   set ACTIVE; sync state (cursor, initial-import) is PRESERVED, because it
   *   belongs to this same mailbox.
   * - Existing row owned by ANOTHER user → reject: a Gmail account belongs to
   *   exactly one KeepInTax user globally.
   *
   * Connection updates are conditional and do not overwrite sync state.
   */
  async upsertIntegration(input: UpsertIntegrationInput): Promise<UserIntegration> {
    if (!input.accountId || !input.connectedAccountId) {
      throw new ConflictException(
        `Cannot connect ${input.provider}: the provider returned no account id.`,
      );
    }

    const existing = await this.findByProviderAndAccountId(input.provider, input.accountId);
    const previousConnectedAccountId = existing?.connectedAccountId ?? null;

    if (existing?.remoteDisconnectPending) throw new ConflictException('Complete the pending disconnection first');

    if (existing && existing.firebaseId !== input.firebaseId) {
      this.logger.warn(
        `Rejected ${input.provider} connect: account ${input.accountId} is already ` +
          `linked to another KeepInTax user (integration ${existing.id})`,
      );
      throw new ConflictException(
        'This account is already connected to a different KeepInTax user.',
      );
    }

    const integration =
      existing ??
      this.userIntegrationRepo.create({
        firebaseId: input.firebaseId,
        provider: input.provider,
      });

    integration.accountId = input.accountId;
    if (existing?.lastSyncStatus === IntegrationSyncStatus.RUNNING) {
      throw new ConflictException('Cannot replace a connection while synchronization is running');
    }
    integration.connectionBackend = 'COMPOSIO';
    if (existing?.connectedAccountId && existing.connectedAccountId !== input.connectedAccountId) {
      integration.retiredConnectedAccountIds = [...new Set([...(existing.retiredConnectedAccountIds || []), existing.connectedAccountId])];
    }
    integration.connectedAccountId = input.connectedAccountId;
    integration.connectionVerifiedAt = new Date();
    integration.remoteDisconnectPending = false;
    integration.refreshToken = null;
    integration.accessToken = null;
    integration.accountEmail = input.accountEmail ?? null;
    integration.scopes = input.scopes ?? null;
    integration.expiresAt = input.expiresAt ?? null;
    integration.status = IntegrationStatus.ACTIVE;
    if(input.businessNumber!==undefined)integration.emailRouting={...routingSettings(existing?.emailRouting),businessNumber:input.businessNumber};

    let saved: UserIntegration;
    try {
      if (existing) {
        const values = {
          connectionBackend: integration.connectionBackend, connectedAccountId: integration.connectedAccountId,
          connectionVerifiedAt: integration.connectionVerifiedAt,
          retiredConnectedAccountIds: integration.retiredConnectedAccountIds, remoteDisconnectPending: false,
          accountEmail: integration.accountEmail, status: IntegrationStatus.ACTIVE,
          refreshToken: null, accessToken: null, scopes: integration.scopes, expiresAt: integration.expiresAt,
          ...(input.businessNumber===undefined?{}:{emailRouting:()=>"JSON_SET(COALESCE(email_routing_json,JSON_OBJECT('rules',JSON_ARRAY())), '$.businessNumber', :routingBusiness)"}),
        };
        const result = await this.userIntegrationRepo.createQueryBuilder().update(UserIntegration).set(values)
          .where('id = :id AND firebase_id = :firebaseId AND connected_account_id <=> :previousConnection AND remote_disconnect_pending = 0 AND (last_sync_status IS NULL OR last_sync_status <> :running)', {
            id: existing.id, firebaseId: input.firebaseId, running: IntegrationSyncStatus.RUNNING, previousConnection: previousConnectedAccountId,
            ...(input.businessNumber===undefined?{}:{routingBusiness:input.businessNumber}),
          }).execute();
        if (result.affected !== 1) throw new ConflictException('Connection changed or a synchronization started; retry');
        saved = integration;
      } else saved = await this.userIntegrationRepo.save(integration);
    }
    catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('Account already connected');
      throw error;
    }
    this.logger.log(
      `${existing ? 'Updated' : 'Created'} ${input.provider} integration ` +
        `${saved.id} for firebaseId=${input.firebaseId}`,
    );
    return saved;
  }

  /**
   * Marks the integration REVOKED (user disconnect) or EXPIRED (invalid_grant).
   * The row is kept for audit/history; a re-connect goes through upsertIntegration.
   */
  async updateStatus(integrationId: number, status: IntegrationStatus): Promise<void> {
    await this.userIntegrationRepo.update(
      status === IntegrationStatus.EXPIRED ? { id: integrationId, status: IntegrationStatus.ACTIVE } : { id: integrationId },
      { status },
    );
  }

  /**
   * Integrations eligible for the nightly Gmail sync: ACTIVE Google
   * connections whose initial manual import completed. RUNNING rows are NOT
   * excluded here — the sync itself decides whether a RUNNING marker is live
   * (skip) or stale from a crashed run (recover), so that logic stays in one
   * place (GmailSyncService).
   */
  async findGmailSyncCandidates(): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: {
        provider: In([IntegrationProvider.GOOGLE, IntegrationProvider.MICROSOFT]),
        status: IntegrationStatus.ACTIVE,
        initialImportCompletedAt: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });
  }

  // --- Gmail sync state transitions ------------------------------------------
  // The three legal moves are RUNNING → SUCCESS and RUNNING → ERROR (plus the
  // reset on account change in upsertIntegration). Callers own the decision of
  // WHEN a run counts as successful; this service only persists the outcome.

  /** A sync run (initial import or nightly) is starting now. */
  async markSyncRunning(integrationId: number): Promise<void> {
    const result = await this.userIntegrationRepo.createQueryBuilder()
      .update(UserIntegration)
      .set({
        lastSyncStatus: IntegrationSyncStatus.RUNNING,
        lastSyncStartedAt: new Date(),
        lastSyncError: null,
      })
      .where('id = :id AND status = :active AND (last_sync_status IS NULL OR last_sync_status <> :running OR last_sync_started_at < :stale)', {
        id: integrationId, active: IntegrationStatus.ACTIVE, running: IntegrationSyncStatus.RUNNING,
        stale: new Date(Date.now() - 6 * 60 * 60 * 1000),
      })
      .execute();
    if (result.affected !== 1) throw new ConflictException('A synchronization is already running or the connection is inactive');
  }

  /**
   * A sync run finished successfully — advance the cursor. When the run was
   * the initial manual import, also record its completion and chosen range
   * (dates as 'YYYY-MM-DD').
   */
  async markSyncSuccess(
    integrationId: number,
    options: {
      lastSuccessfulSyncAt: Date;
      initialImport?: { fromDate: string; toDate: string };
    },
  ): Promise<void> {
    const update: Partial<UserIntegration> = {
      lastSyncStatus: IntegrationSyncStatus.SUCCESS,
      lastSyncError: null,
      lastSuccessfulSyncAt: options.lastSuccessfulSyncAt,
    };
    if (options.initialImport) {
      update.initialImportCompletedAt = new Date();
      update.initialImportFromDate = options.initialImport.fromDate;
      update.initialImportToDate = options.initialImport.toDate;
    }
    await this.userIntegrationRepo.update({ id: integrationId }, update);
  }

  /** A sync run failed — record why. The cursor is deliberately NOT advanced. */
  async markSyncError(integrationId: number, error: string): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        lastSyncStatus: IntegrationSyncStatus.ERROR,
        // TEXT column, but keep pathological messages bounded anyway.
        lastSyncError: error.length > 2000 ? error.slice(0, 2000) : error,
      },
    );
  }

  /**
   * User-initiated disconnect: clears the stored tokens and marks the
   * integration REVOKED. The row is kept for audit/history.
   */
  async disconnect(integrationId: number): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        refreshToken: null,
        accessToken: null,
        expiresAt: null,
        status: IntegrationStatus.REVOKED,
        remoteDisconnectPending: true,
      },
    );
    this.logger.log(`Integration ${integrationId} disconnected (tokens cleared, status REVOKED)`);
  }

  findByConnectedAccountId(connectedAccountId: string, firebaseId: string): Promise<UserIntegration | null> {
    return this.userIntegrationRepo.findOne({ where: { connectedAccountId, firebaseId } });
  }

  async finishRemoteDisconnect(integrationId: number): Promise<void> {
    await this.userIntegrationRepo.update({ id: integrationId, status: IntegrationStatus.REVOKED }, { remoteDisconnectPending: false });
  }

  async expireConnectedAccount(connectedAccountId: string, firebaseId: string): Promise<void> {
    await this.userIntegrationRepo.update({ connectedAccountId, firebaseId, status: IntegrationStatus.ACTIVE }, { status: IntegrationStatus.EXPIRED });
  }

  async clearRetiredConnections(integrationId: number, connectedAccountId: string): Promise<void> {
    await this.userIntegrationRepo.update({ id: integrationId, connectedAccountId }, { retiredConnectedAccountIds: null });
  }

  async finishManualSync(integrationId: number, failed: boolean, reason?: string, startedAt?: Date): Promise<void> {
    if (startedAt) {
      // A completed manual pull clears older errors without advancing the nightly cursor
      // or overwriting a newer/in-flight synchronization.
      await this.userIntegrationRepo.createQueryBuilder().update(UserIntegration)
        .set({ lastSyncStatus: failed ? IntegrationSyncStatus.ERROR : IntegrationSyncStatus.SUCCESS,
          lastSyncError: failed ? (reason || 'Manual scan incomplete; retry required').slice(0, 2000) : null })
        .where("id = :id AND status = :active AND (last_sync_status IS NULL OR last_sync_status <> :running) AND (last_sync_started_at IS NULL OR last_sync_started_at <= :startedAt) AND NOT EXISTS (SELECT 1 FROM email_import_runs newer WHERE newer.integration_id = :id AND newer.started_at > :startedAt)",
          { id: integrationId, active: IntegrationStatus.ACTIVE, running: IntegrationSyncStatus.RUNNING, startedAt })
        .execute();
      return;
    }
    await this.userIntegrationRepo.update({ id: integrationId }, { lastSyncStatus: failed ? IntegrationSyncStatus.ERROR : IntegrationSyncStatus.SUCCESS, lastSyncError: failed ? (reason || 'Manual scan incomplete; retry required').slice(0, 2000) : null });
  }
}
