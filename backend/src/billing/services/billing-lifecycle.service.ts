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
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';

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

export interface BillingProviderPort {
  submitCharge(input: {
    actor: BillingMutationActorContext;
    attemptId: number;
    expectedStateVersion: number;
    leaseOwner: string;
  }): Promise<{ kind: string; outcome?: NormalizedChargeOutcome }>;
}

export interface BillingReceiptFinalizer {
  createReceipt(
    attempt: unknown,
    outcome: NormalizedChargeOutcome,
  ): Promise<{ receiptDocId: number }>;
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
    private readonly provider: BillingProviderRuntimeService,
  ) {}

  openRenewal(
    input: CanonicalBillingPeriodInput,
  ): Promise<OpenBillingAttemptResult> {
    return this.openAttempt(
      input,
      BillingObligationKind.RECURRING_PERIOD,
      BillingAttemptTrigger.RENEWAL,
    );
  }

  /** Recovery reuses the same subscription + period identity as renewal. */
  openPastDueRecovery(
    input: CanonicalBillingPeriodInput,
  ): Promise<OpenBillingAttemptResult> {
    return this.openAttempt(
      input,
      BillingObligationKind.RECURRING_PERIOD,
      BillingAttemptTrigger.RECOVERY,
    );
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

  /** Full local lifecycle: open, provider-runtime lease/I-O, receipt, finalize. */
  async executeRenewal(
    input: CanonicalBillingPeriodInput,
    provider: BillingProviderPort = this.provider,
    receipt: BillingReceiptFinalizer,
    leaseOwner: string,
  ) {
    this.orchestration.assertOwnerMutation(input.actor);
    const opened = await this.openRenewal(input);
    const submitted = await provider.submitCharge({
      actor: input.actor,
      attemptId: opened.attempt.id,
      expectedStateVersion: opened.attempt.stateVersion,
      leaseOwner,
    });
    if (
      submitted.kind !== 'APPLIED' ||
      submitted.outcome?.kind !== 'CAPTURED'
    ) {
      return { opened, submitted, finalized: false };
    }
    const createdReceipt = await receipt.createReceipt(
      opened.attempt,
      submitted.outcome,
    );
    const finalized = await this.finalizeAfterReceipt(
      opened.attempt.id,
      createdReceipt.receiptDocId,
    );
    return { opened, submitted, finalized: finalized.status === 'COMPLETED' };
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
