import { Injectable, Logger } from '@nestjs/common';
import {
  BillingAttemptOrchestrationService,
  BillingMutationActorContext,
  BillingPeriodSnapshot,
  NormalizedChargeOutcome,
  OpenBillingAttemptResult,
} from './billing-attempt-orchestration.service';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
  BillingObligationStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
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

/**
 * Creates (or, on a retry, idempotently re-finds) the receipt and any journal
 * work for one CAPTURED attempt. Implementations MUST be idempotent per
 * attempt: the lifecycle calls this again for the same attempt after a
 * failure and relies on it never issuing a second document.
 */
export interface BillingReceiptFinalizer {
  createReceipt(
    attempt: unknown,
    outcome: NormalizedChargeOutcome,
  ): Promise<{ receiptDocId: number }>;
}

export type PostCaptureFailureCategory =
  | 'MISSING_TRANSACTION_ID'
  | 'ACTIVATION_FAILED'
  | 'ACTIVATION_DEFERRED'
  | 'RECEIPT_STEP_FAILED'
  | 'FINALIZATION_FAILED';

/**
 * Thrown by an activation step that must not run yet (for example while the
 * original webhook delivery may still be persisting the card token). It is
 * reported as ACTIVATION_DEFERRED — a retry later, not a failure to record.
 */
export class PostCaptureDeferredError extends Error {
  constructor(message = 'Post-capture activation deferred') {
    super(message);
    this.name = 'PostCaptureDeferredError';
  }
}

/** Outcome of resuming only the post-capture phase of a CAPTURED attempt. */
export type ResumeCapturedAttemptResult =
  | { status: 'COMPLETED'; attempt: BillingAttempt }
  | { status: 'ALREADY_COMPLETED'; attempt: BillingAttempt }
  | { status: 'NOT_CAPTURED'; attempt: BillingAttempt }
  | { status: 'LEASE_HELD'; attempt: BillingAttempt }
  | {
      status: 'RECEIPT_PENDING';
      attempt: BillingAttempt;
      /** Sanitized: never carries provider, token or payment details. */
      failureCategory: PostCaptureFailureCategory;
    };

/** Masks card-number-like digit runs and credential key/value pairs. */
export function redactForLog(message: string): string {
  return message
    .replace(/\b\d{12,19}\b/g, '[redacted-number]')
    .replace(
      /\b(token|apiname|apipassword|password|secret)\b\s*[=:]\s*\S+/gi,
      '$1=[redacted]',
    );
}

export interface RenewalExecutionResult {
  /** Null when the period was already settled or an existing capture was resumed. */
  opened: OpenBillingAttemptResult | null;
  /** Null whenever the provider was not (and must not be) called. */
  submitted: { kind: string; outcome?: NormalizedChargeOutcome } | null;
  /** True once the attempt is COMPLETED (by this call or an earlier one). */
  finalized: boolean;
  /** True when an existing CAPTURED attempt was resumed without provider I/O. */
  resumedCaptured: boolean;
  /** Set when the period was already SATISFIED before this call. */
  alreadyCompleted: boolean;
  resume: ResumeCapturedAttemptResult | null;
  snapshotAttempt: BillingAttempt | null;
}

/**
 * Coordinates renewal and PAST_DUE recovery on the canonical obligation
 * aggregate. Provider I/O belongs to BillingProviderRuntimeService: this
 * service deliberately only opens attempts, applies already-normalized
 * outcomes, and finalizes a captured attempt after receipt creation.
 */
@Injectable()
export class BillingLifecycleService {
  private readonly logger = new Logger(BillingLifecycleService.name);

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
    chargeMode: BillingChargeMode = BillingChargeMode.LOW_PROFILE_HOSTED,
  ): Promise<OpenBillingAttemptResult> {
    return this.openAttempt(
      input,
      BillingObligationKind.RECURRING_PERIOD,
      BillingAttemptTrigger.RECOVERY,
      chargeMode,
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

  /** Applies a verified hosted-webhook result without replaying provider I/O. */
  async applyHostedWebhookOutcome(
    input: CanonicalBillingPeriodInput['actor'],
    attemptId: number,
    outcome: NormalizedChargeOutcome,
    leaseOwner: string,
  ) {
    this.orchestration.assertOwnerMutation(input);
    const opened = await this.orchestration.claimForSubmission(
      attemptId,
      leaseOwner,
      0,
    );
    if (!opened.claimed) return opened.attempt;
    return this.orchestration.applyNormalizedOutcome(
      attemptId,
      leaseOwner,
      opened.attempt.stateVersion,
      outcome,
    );
  }

  finalizeAfterReceipt(attemptId: number, receiptDocId: number) {
    return this.orchestration.finalizeCapturedAttempt(attemptId, receiptDocId);
  }

  /** Hosted attempts stuck CAPTURED past `capturedBefore` (system read-only). */
  findCapturedHostedAttempts(capturedBefore: Date, limit: number) {
    return this.orchestration.findCapturedHostedAttempts(capturedBefore, limit);
  }

  /**
   * Read-only owner-checked view of a period's canonical debt/attempt, used to
   * detect an existing capture before a price is re-derived.
   */
  inspectPeriod(
    actor: BillingMutationActorContext,
    subscriptionId: number,
    periodStart: string,
  ): Promise<BillingPeriodSnapshot | null> {
    this.orchestration.assertOwnerMutation(actor);
    return this.orchestration.findPeriodSnapshot(
      subscriptionId,
      periodStart,
      actor.subjectFirebaseId,
    );
  }

  /**
   * The single post-capture path. Runs ONLY the receipt/journal/completion
   * phase for an attempt that is already CAPTURED; it never claims the attempt
   * for submission and never touches the provider. The first run right after a
   * capture and every later retry share this code.
   *
   * - Exclusive finalization lease: concurrent runs cannot both proceed.
   * - The receipt finalizer is idempotent per attempt, so a retry re-finds the
   *   existing receipt/journal instead of issuing another.
   * - COMPLETED/SATISFIED is written only after the receipt step succeeds; on
   *   any failure the attempt stays CAPTURED (never UNKNOWN/DECLINED) with its
   *   original provider transaction id, and the lease is released so the next
   *   run can retry. Failures are reported with a sanitized category only.
   */
  async resumeCapturedAttempt(input: {
    actor: BillingMutationActorContext;
    attemptId: number;
    receipt: BillingReceiptFinalizer;
    leaseOwner: string;
    /**
     * Optional local step that must be complete BEFORE the receipt and the
     * completion: applies the subscription state this capture paid for. It
     * must be idempotent (a no-op when already applied) and must never touch
     * the provider. A throw keeps the attempt CAPTURED and retryable.
     */
    activate?: (attempt: BillingAttempt) => Promise<void>;
  }): Promise<ResumeCapturedAttemptResult> {
    const { actor, attemptId, receipt, leaseOwner, activate } = input;
    this.orchestration.assertOwnerMutation(actor);
    const claim = await this.orchestration.claimForFinalization(
      attemptId,
      leaseOwner,
      actor.subjectFirebaseId,
    );
    if (!claim.claimed) {
      if (claim.reason === 'ALREADY_COMPLETED')
        return { status: 'ALREADY_COMPLETED', attempt: claim.attempt };
      if (claim.reason === 'NOT_CAPTURED')
        return { status: 'NOT_CAPTURED', attempt: claim.attempt };
      return { status: 'LEASE_HELD', attempt: claim.attempt };
    }

    const captured = claim.attempt;
    const fail = async (
      failureCategory: PostCaptureFailureCategory,
      error?: unknown,
    ): Promise<ResumeCapturedAttemptResult> => {
      // Diagnostics stay in server logs only (callers get the category), and
      // even there card-number-like digits and credential key/values are masked.
      const line = `Post-capture completion ${
        failureCategory === 'ACTIVATION_DEFERRED' ? 'deferred' : 'failed'
      } for attempt #${captured.id} (${failureCategory}): ${redactForLog(
        (error as Error | undefined)?.message ?? 'n/a',
      )}`;
      if (failureCategory === 'ACTIVATION_DEFERRED') this.logger.warn(line);
      else this.logger.error(line);
      await this.orchestration
        .releaseFinalizationLease(captured.id, captured.stateVersion)
        .catch((releaseError: unknown) =>
          this.logger.error(
            `Failed to release finalization lease for attempt #${
              captured.id
            }: ${(releaseError as Error)?.message}`,
          ),
        );
      return { status: 'RECEIPT_PENDING', attempt: captured, failureCategory };
    };

    if (!captured.cardcomTransactionId) {
      return fail('MISSING_TRANSACTION_ID');
    }
    const outcome: NormalizedChargeOutcome = {
      kind: 'CAPTURED',
      cardcomTransactionId: captured.cardcomTransactionId,
      providerTerminalRef: captured.providerTerminalRef,
      providerResponseCode: captured.providerResponseCode,
    };

    if (activate) {
      try {
        await activate(captured);
      } catch (error) {
        return fail(
          error instanceof PostCaptureDeferredError
            ? 'ACTIVATION_DEFERRED'
            : 'ACTIVATION_FAILED',
          error,
        );
      }
    }

    let receiptDocId: number;
    try {
      ({ receiptDocId } = await receipt.createReceipt(captured, outcome));
    } catch (error) {
      return fail('RECEIPT_STEP_FAILED', error);
    }
    try {
      const finalized = await this.finalizeAfterReceipt(
        captured.id,
        receiptDocId,
      );
      return { status: 'COMPLETED', attempt: finalized };
    } catch (error) {
      return fail('FINALIZATION_FAILED', error);
    }
  }

  /**
   * Full local lifecycle: open, provider-runtime lease/I-O, then the shared
   * post-capture path. A period that is already SATISFIED is a no-op, and an
   * attempt already CAPTURED skips the provider entirely and only resumes the
   * post-capture phase (the debt snapshot is not re-validated against a fresh
   * price, which may have drifted since the capture).
   */
  async executeRenewal(
    input: CanonicalBillingPeriodInput,
    receipt: BillingReceiptFinalizer,
    leaseOwner: string,
    provider: BillingProviderPort = this.provider,
  ): Promise<RenewalExecutionResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    const snapshot = await this.orchestration.findPeriodSnapshot(
      input.subscriptionId,
      input.periodStart,
      input.actor.subjectFirebaseId,
    );

    if (snapshot?.obligation.status === BillingObligationStatus.SATISFIED) {
      return {
        opened: null,
        submitted: null,
        finalized: true,
        resumedCaptured: false,
        alreadyCompleted: true,
        resume: null,
        snapshotAttempt: snapshot.attempt,
      };
    }

    let opened: OpenBillingAttemptResult | null = null;
    let submitted: RenewalExecutionResult['submitted'] = null;
    let attemptId: number;

    if (snapshot?.attempt?.status === BillingAttemptStatus.CAPTURED) {
      attemptId = snapshot.attempt.id;
    } else {
      opened = await this.openRenewal(input);
      if (opened.attempt.status === BillingAttemptStatus.CAPTURED) {
        attemptId = opened.attempt.id;
      } else {
        submitted = await provider.submitCharge({
          actor: input.actor,
          attemptId: opened.attempt.id,
          expectedStateVersion: opened.attempt.stateVersion,
          leaseOwner,
        });
        if (
          submitted.kind !== 'APPLIED' ||
          submitted.outcome?.kind !== 'CAPTURED'
        ) {
          return {
            opened,
            submitted,
            finalized: false,
            resumedCaptured: false,
            alreadyCompleted: false,
            resume: null,
            snapshotAttempt: null,
          };
        }
        attemptId = opened.attempt.id;
      }
    }

    const resume = await this.resumeCapturedAttempt({
      actor: input.actor,
      attemptId,
      receipt,
      leaseOwner,
    });
    return {
      opened,
      submitted,
      finalized:
        resume.status === 'COMPLETED' || resume.status === 'ALREADY_COMPLETED',
      resumedCaptured: submitted === null,
      alreadyCompleted: false,
      resume,
      snapshotAttempt: null,
    };
  }

  private openAttempt(
    input: CanonicalBillingPeriodInput,
    kind: BillingObligationKind,
    trigger: BillingAttemptTrigger,
    chargeMode: BillingChargeMode = BillingChargeMode.TOKEN_TRANSACTION,
  ): Promise<OpenBillingAttemptResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    return this.orchestration.createOrGetAttempt({
      ...input,
      kind,
      trigger,
      chargeMode,
    });
  }
}
