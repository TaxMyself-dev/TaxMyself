import { Injectable } from '@nestjs/common';
import {
  BillingAttemptOrchestrationService,
  BillingMutationActorContext,
  NormalizedChargeOutcome,
  OpenBillingAttemptResult,
} from './billing-attempt-orchestration.service';
import {
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
} from '../enums/billing.enums';

export interface CanonicalBillingPeriodInput {
  actor: BillingMutationActorContext;
  subscriptionId: number;
  planId: number;
  periodStart: string;
  periodEnd: string;
  amountAgorot: number;
  amountBeforeVatAgorot: number;
  vatAmountAgorot: number;
  currency?: string;
}

/**
 * Coordinates renewal and PAST_DUE recovery on the canonical obligation
 * aggregate. Provider I/O belongs to BillingProviderRuntimeService: this
 * service deliberately only opens attempts, applies already-normalized
 * outcomes, and finalizes a captured attempt after receipt creation.
 */
@Injectable()
export class BillingLifecycleService {
  constructor(
    private readonly orchestration: BillingAttemptOrchestrationService,
  ) {}

  openRenewal(input: CanonicalBillingPeriodInput): Promise<OpenBillingAttemptResult> {
    return this.openAttempt(input, BillingObligationKind.RECURRING_PERIOD, BillingAttemptTrigger.RENEWAL);
  }

  /** Recovery reuses the same subscription + period identity as renewal. */
  openPastDueRecovery(input: CanonicalBillingPeriodInput): Promise<OpenBillingAttemptResult> {
    return this.openAttempt(input, BillingObligationKind.RECURRING_PERIOD, BillingAttemptTrigger.RECOVERY);
  }

  applyProviderOutcome(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    outcome: NormalizedChargeOutcome,
  ) {
    return this.orchestration.applyNormalizedOutcome(
      attemptId,
      leaseOwner,
      expectedStateVersion,
      outcome,
    );
  }

  finalizeAfterReceipt(attemptId: number, receiptDocId: number) {
    return this.orchestration.finalizeCapturedAttempt(attemptId, receiptDocId);
  }

  private openAttempt(
    input: CanonicalBillingPeriodInput,
    kind: BillingObligationKind,
    trigger: BillingAttemptTrigger,
  ): Promise<OpenBillingAttemptResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    return this.orchestration.createOrGetAttempt({
      ...input,
      kind,
      trigger,
      chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
    });
  }
}
