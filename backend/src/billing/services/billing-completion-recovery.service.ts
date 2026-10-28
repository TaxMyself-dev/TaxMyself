import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingChargeMode } from '../enums/billing.enums';
import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

/** Local post-capture work only. No charge/renewal entry point or provider submission. */
@Injectable()
export class BillingCompletionRecoveryService {
  private readonly logger = new Logger(BillingCompletionRecoveryService.name);
  private running = false;

  constructor(
    private readonly orchestration: BillingAttemptOrchestrationService,
    private readonly hosted: BillingHostedCompletionService,
    private readonly renewal: SubscriptionRenewalService,
  ) {}

  @Cron('*/1 * * * *', { name: 'billingCompletionRecovery', timeZone: 'Asia/Jerusalem' })
  async recover(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.orchestration.findDueCapturedAttempts(now, 20);
      for (const candidate of candidates) {
        try {
          const status = candidate.chargeMode === BillingChargeMode.LOW_PROFILE_HOSTED
            ? await this.hosted.completeCapturedHostedAttempt({
                firebaseId: candidate.firebaseId, subscriptionId: candidate.subscriptionId,
                billingAttemptId: candidate.attemptId,
                scheduledOnly: true,
              })
            : await this.renewal.completeCapturedAttempt(candidate.attemptId, true);
          if (status === 'RECEIPT_PENDING') {
            this.logger.warn(`Captured attempt #${candidate.attemptId} still needs local completion; retry scheduled`);
          }
        } catch {
          // Do not log provider/customer payloads. One broken row cannot block others.
          this.logger.error(`Captured attempt #${candidate.attemptId} could not resume local completion`);
        }
      }
    } catch {
      this.logger.error('Could not list captured attempts for local completion');
    } finally {
      this.running = false;
    }
  }
}
