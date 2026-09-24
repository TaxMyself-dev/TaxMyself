import { Injectable, Logger, Optional } from '@nestjs/common';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import {
  BillingAttemptStatus,
  BillingChargeMode,
} from '../enums/billing.enums';
import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';

/** At most this many attempts of each kind are handled per sweep, serially. */
export const RECONCILIATION_SWEEP_BATCH = 20;

export interface ReconciliationSweepSummary {
  /** Expired PROCESSING leases moved to UNKNOWN by this sweep. */
  expired: number;
  /** UNKNOWN attempts that were due for a lookup. */
  due: number;
  captured: number;
  declined: number;
  /** Stayed UNKNOWN with the next backoff step scheduled. */
  unresolved: number;
  /** Ladder exhausted: escalated to MANUAL_REVIEW. */
  manualReview: number;
  /** Another worker held the claim, or the attempt changed meanwhile. */
  notClaimed: number;
  errors: number;
}

/**
 * Conservative, read-only reconciliation of UNKNOWN attempts. It only claims
 * an attempt through the orchestration lease (one worker wins), asks the
 * provider runtime for a lookup — never a charge, checkout, refund or void —
 * and applies the normalized outcome through the canonical state machine.
 *
 * - An expired PROCESSING lease first becomes UNKNOWN (never CREATED). Its
 *   first lookup waits for the existing 1-minute backoff, so the next sweep
 *   picks it up rather than racing a request that may still be in flight.
 * - A token renewal captured here is finalized by the normal renewal flow
 *   (which detects a CAPTURED attempt and never charges again); a hosted
 *   capture is resumed through the hosted completion path.
 * - Bounded, serial, and it never throws: a failure of one attempt (or of the
 *   whole sweep) must not affect the caller.
 */
@Injectable()
export class BillingReconciliationService {
  private readonly logger = new Logger(BillingReconciliationService.name);

  constructor(
    private readonly orchestration: BillingAttemptOrchestrationService,
    private readonly provider: BillingProviderRuntimeService,
    @Optional()
    private readonly hostedCompletion?: BillingHostedCompletionService,
  ) {}

  async reconcileDueAttempts(
    now: Date = new Date(),
    limit: number = RECONCILIATION_SWEEP_BATCH,
  ): Promise<ReconciliationSweepSummary> {
    const summary: ReconciliationSweepSummary = {
      expired: 0,
      due: 0,
      captured: 0,
      declined: 0,
      unresolved: 0,
      manualReview: 0,
      notClaimed: 0,
      errors: 0,
    };

    try {
      const expired = await this.orchestration.findExpiredProcessingAttempts(
        now,
        limit,
      );
      for (const candidate of expired) {
        try {
          await this.orchestration.expireProcessingLeaseToUnknown(
            candidate.attemptId,
            now,
          );
          summary.expired += 1;
        } catch (error) {
          this.recordError(summary, candidate.attemptId, error);
        }
      }

      const due = await this.orchestration.findDueUnknownAttempts(now, limit);
      summary.due = due.length;
      for (const candidate of due) {
        try {
          const result = await this.provider.reconcileCharge({
            actor: {
              actorFirebaseId: candidate.firebaseId,
              subjectFirebaseId: candidate.firebaseId,
            },
            attemptId: candidate.attemptId,
            expectedStateVersion: candidate.stateVersion,
            leaseOwner: `reconcile-${candidate.attemptId}`,
            subscriptionId: candidate.subscriptionId,
          });
          if (result.kind === 'NOT_CLAIMED') {
            summary.notClaimed += 1;
            continue;
          }
          const status = (result.attempt as BillingAttempt).status;
          if (result.outcome.kind === 'CAPTURED') {
            summary.captured += 1;
            await this.resumeHostedCapture(candidate);
          } else if (result.outcome.kind === 'DECLINED') {
            summary.declined += 1;
          } else if (status === BillingAttemptStatus.MANUAL_REVIEW) {
            summary.manualReview += 1;
            this.logger.warn(
              `Billing attempt #${candidate.attemptId} exhausted read-only reconciliation and needs manual review`,
            );
          } else {
            summary.unresolved += 1;
          }
        } catch (error) {
          this.recordError(summary, candidate.attemptId, error);
        }
      }
    } catch (error) {
      this.recordError(summary, null, error);
    }
    return summary;
  }

  /**
   * A reconciled hosted capture goes through the same idempotent completion path
   * as a webhook or the Task 3B sweep. It may defer (recovery grace period);
   * the 3B sweep then finishes it. Token renewals are completed by the renewal
   * flow itself and need nothing here.
   */
  private async resumeHostedCapture(candidate: {
    attemptId: number;
    subscriptionId: number;
    firebaseId: string;
    chargeMode: BillingChargeMode;
  }): Promise<void> {
    if (
      candidate.chargeMode !== BillingChargeMode.LOW_PROFILE_HOSTED ||
      !this.hostedCompletion
    ) {
      return;
    }
    try {
      await this.hostedCompletion.completeCapturedHostedAttempt({
        firebaseId: candidate.firebaseId,
        subscriptionId: candidate.subscriptionId,
        billingAttemptId: candidate.attemptId,
      });
    } catch (error) {
      this.logger.warn(
        `Hosted completion after reconciliation skipped for attempt #${
          candidate.attemptId
        }: ${(error as Error)?.message ?? 'unknown error'}`,
      );
    }
  }

  private recordError(
    summary: ReconciliationSweepSummary,
    attemptId: number | null,
    error: unknown,
  ): void {
    summary.errors += 1;
    this.logger.error(
      `Billing reconciliation ${
        attemptId === null ? 'sweep' : `of attempt #${attemptId}`
      } failed: ${(error as Error)?.message ?? 'unknown error'}`,
    );
  }
}
