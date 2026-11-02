import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, IsNull, LessThanOrEqual, MoreThan, Or } from 'typeorm';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingAttemptStatus, BillingChargeMode, BillingEventType } from '../enums/billing.enums';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { BillingTasksService, CompletionTaskKind } from './billing-tasks.service';

/** HTTP queue delivery executes local work. Daily repair only enqueues orphaned work. */
@Injectable()
export class BillingCompletionRecoveryService {
  private readonly logger = new Logger(BillingCompletionRecoveryService.name);
  private running = false;
  constructor(private readonly hosted: BillingHostedCompletionService, private readonly renewal: SubscriptionRenewalService,
    private readonly events: BillingEventService, private readonly receipts: BillingReceiptService,
    private readonly issuers: BillingIssuerConfigService, private readonly tasks: BillingTasksService,
    private readonly dataSource: DataSource) {}

  async handle(kind: CompletionTaskKind, id: number, now = new Date()): Promise<void> {
    if (!this.tasks.enabled) throw new ServiceUnavailableException('Billing task delivery is disabled');
    if (kind === 'MAIL') {
      const event = await this.events.findReceiptTaskEvent(id);
      if (!event) return;
      if (![BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS].includes(event.eventType) ||
        event.receiptEmailSent || event.metadata?.receiptEmail?.skipped === 'NO_RECIPIENT') return;
      if (!event.receiptDocId) throw new ServiceUnavailableException('Existing receipt is not ready');
      const issuer = await this.issuers.getKeepintaxIssuer();
      const result = await this.receipts.sendReceiptEmailForPaymentEvent(id, issuer.issuerName);
      if (result.error) throw new ServiceUnavailableException('Receipt email remains pending');
      return;
    }
    const attempt = await this.dataSource.manager.findOne(BillingAttempt, { where: { id } });
    if (!attempt || attempt.operation !== 'CHARGE' || attempt.status !== BillingAttemptStatus.CAPTURED) return;
    if ((attempt.nextActionAt && attempt.nextActionAt > now) || (attempt.leaseExpiresAt && attempt.leaseExpiresAt > now)) {
      throw new ServiceUnavailableException('Captured completion is deferred');
    }
    const debt = await this.dataSource.manager.findOne(BillingObligation, { where: { id: attempt.obligationId } });
    if (!debt) throw new ServiceUnavailableException('Captured obligation unavailable');
    const status = attempt.chargeMode === BillingChargeMode.LOW_PROFILE_HOSTED
      ? await this.hosted.completeCapturedHostedAttempt({ firebaseId: debt.firebaseIdSnapshot,
          subscriptionId: debt.subscriptionId, billingAttemptId: id, scheduledOnly: true })
      : await this.renewal.completeCapturedAttempt(id, true);
    if (!['COMPLETED', 'ALREADY_COMPLETED'].includes(status)) throw new ServiceUnavailableException('Captured completion remains pending');
  }

  async recover(now = new Date()): Promise<void> {
    if (!this.tasks.enabled || this.running) return;
    this.running = true;
    let failed = false;
    const generation = `repair-${now.toISOString().slice(0, 10)}`;
    try {
      let afterId = 0;
      for (let page = 0; page < 20; page++) {
        const attempts = await this.dataSource.manager.find(BillingAttempt, { where: {
          id: MoreThan(afterId), operation: 'CHARGE', status: BillingAttemptStatus.CAPTURED,
          capturedAt: LessThanOrEqual(new Date(now.getTime() - 60000)),
          nextActionAt: Or(IsNull(), LessThanOrEqual(now)), leaseExpiresAt: Or(IsNull(), LessThanOrEqual(now)),
        }, order: { id: 'ASC' }, take: 100 });
        for (const attempt of attempts) {
          if (!await this.tasks.enqueue('CAPTURE', attempt.id, attempt.nextActionAt ?? now, generation)) failed = true;
        }
        if (attempts.length < 100) break;
        afterId = attempts[attempts.length - 1].id;
        if (page === 19) { failed = true; this.logger.error('Captured daily repair reached its 2000-row limit; operator review required'); }
      }
    } catch { failed = true; this.logger.error('Could not enqueue captured daily repair'); }
    try {
      let afterId = 0;
      for (let page = 0; page < 20; page++) {
        const events = await this.events.findDueReceiptEmails(now, 100, afterId);
        for (const event of events) {
          if (!await this.tasks.enqueue('MAIL', event.id, now, generation)) failed = true;
        }
        if (events.length < 100) break;
        afterId = events[events.length - 1].id;
        if (page === 19) { failed = true; this.logger.error('Mail daily repair reached its 2000-row limit; operator review required'); }
      }
    } catch { failed = true; this.logger.error('Could not enqueue receipt email daily repair'); }
    finally { this.running = false; }
    if (failed) throw new ServiceUnavailableException('Daily billing task repair is incomplete');
  }
}
