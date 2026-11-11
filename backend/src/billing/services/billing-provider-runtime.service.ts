import { Inject, Injectable, Logger } from '@nestjs/common';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import type { BillingPayerSnapshot } from './billing-payer-profile.service';
import {
  BillingAttemptTrigger,
  BillingChargeMode,
} from '../enums/billing.enums';
import {
  BillingAttemptOrchestrationService,
  BillingMutationActorContext,
  BillingPreSubmissionDisposition,
  BillingPreSubmissionFailureReason,
  NormalizedChargeOutcome,
  preSubmissionDisposition,
} from './billing-attempt-orchestration.service';

export const BILLING_CARD_COM_EXECUTOR = Symbol('BILLING_CARD_COM_EXECUTOR');
export interface CardComChargeRequest {
  attemptId: number;
  paymentMethodId: number | null;
  externalUniqTranId: string;
  amountAgorot: number;
  currency: string;
  /** Reconciliation context (read-only lookups); unused by executeCharge. */
  chargeMode?: BillingChargeMode;
  lowProfileId?: string | null;
  planId?: number;
  firebaseId?: string;
  subscriptionId?: number | null;
  payerProfile?: BillingPayerSnapshot | null;
  trigger?: BillingAttemptTrigger;
  attemptNumber?: number;
  obligationId?: number | null;
}
export interface CardComChargeResponse {
  success?: boolean;
  responseCode?: number | string | null;
  transactionId?: string | null;
  terminalRef?: string | null;
  failureCategory?: string | null;
  providerDescription?: string | null;
  /**
   * Reconciliation only: the executor proved that this exact attempt was
   * rejected. Without it a non-success lookup result is never a decline.
   */
  definitiveDecline?: boolean;
}

/**
 * Thrown by an executor when the local pre-flight failed BEFORE any request
 * reached CardCom (missing payment method/token/expiry, expired card,
 * undecryptable token). No charge can have been made, so it is not an
 * uncertain outcome. Carries only the typed reason: never the underlying
 * exception, token or payment details.
 */
export class BillingPreSubmissionError extends Error {
  constructor(public readonly reason: BillingPreSubmissionFailureReason) {
    super(`Billing pre-submission failure: ${reason}`);
    this.name = 'BillingPreSubmissionError';
  }
}
export interface BillingCardComExecutor {
  executeCharge(request: CardComChargeRequest): Promise<CardComChargeResponse>;
  reconcileCharge(
    request: CardComChargeRequest,
  ): Promise<CardComChargeResponse>;
}
export interface ProviderRuntimeInput {
  actor: BillingMutationActorContext;
  attemptId: number;
  expectedStateVersion: number;
  leaseOwner: string;
  /** Reconciliation only: lets a hosted result be tied to its subscription. */
  subscriptionId?: number;
}
export type ProviderRuntimeResult =
  | { kind: 'NOT_CLAIMED'; reason?: string; attempt: unknown }
  | { kind: 'APPLIED'; outcome: NormalizedChargeOutcome; attempt: unknown };
/** A submission can also end in a local failure before any provider request. */
export type ProviderSubmitResult =
  | ProviderRuntimeResult
  | {
      kind: 'LOCAL_FAILURE';
      reason: BillingPreSubmissionFailureReason;
      disposition: BillingPreSubmissionDisposition;
      attempt: unknown;
    };

@Injectable()
export class BillingProviderRuntimeService {
  private readonly logger = new Logger(BillingProviderRuntimeService.name);
  constructor(
    private readonly orchestration: BillingAttemptOrchestrationService,
    @Inject(BILLING_CARD_COM_EXECUTOR)
    private readonly executor: BillingCardComExecutor,
  ) {}
  async submitCharge(
    input: ProviderRuntimeInput,
  ): Promise<ProviderSubmitResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    const lease = await this.orchestration.claimForSubmission(
      input.attemptId,
      input.leaseOwner,
      input.expectedStateVersion,
    );
    if (!lease.claimed)
      return {
        kind: 'NOT_CLAIMED',
        reason: lease.reason,
        attempt: lease.attempt,
      };
    const request = {
      attemptId: lease.attempt.id,
      paymentMethodId: lease.attempt.paymentMethodId,
      externalUniqTranId: lease.attempt.cardcomExternalUniqTranId,
      amountAgorot: lease.attempt.amountAgorot,
      currency: lease.attempt.currency,
      payerProfile: lease.attempt.payerProfileSnapshot,
      subscriptionId: input.subscriptionId ?? null,
      trigger: lease.attempt.trigger,
      attemptNumber: lease.attempt.attemptNumber,
      obligationId: lease.attempt.obligationId,
    };
    let outcome: NormalizedChargeOutcome;
    this.logProviderEvent('BILLING_PROVIDER_REQUEST_PREPARED', request);
    try {
      const response = await this.executor.executeCharge(request);
      this.logProviderEvent('BILLING_PROVIDER_RESPONSE_RECEIVED', request, {
        responseCode: response.responseCode ?? null,
        hasTransactionId: !!response.transactionId,
      });
      outcome = normalizeCardComCharge(response);
    } catch (error) {
      if (error instanceof BillingPreSubmissionError) {
        this.logProviderEvent('BILLING_PROVIDER_REQUEST_NOT_SENT', request, {
          reason: error.reason,
        });
        // No request reached CardCom: terminate locally, never as UNKNOWN.
        const attempt = await this.orchestration.applyPreSubmissionFailure(
          lease.attempt.id,
          input.leaseOwner,
          lease.attempt.stateVersion,
          error.reason,
        );
        return {
          kind: 'LOCAL_FAILURE',
          reason: error.reason,
          disposition: preSubmissionDisposition(error.reason),
          attempt,
        };
      }
      this.logProviderEvent('BILLING_PROVIDER_OUTCOME_UNKNOWN', request);
      outcome = { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' };
    }
    const attempt = await this.applyOutcome(lease.attempt, input, outcome);
    return { kind: 'APPLIED', outcome, attempt };
  }

  private logProviderEvent(
    event: string,
    request: CardComChargeRequest,
    extra: Record<string, unknown> = {},
  ): void {
    this.logger.log(JSON.stringify({
      event,
      attemptId: request.attemptId,
      subscriptionId: request.subscriptionId ?? null,
      obligationId: request.obligationId ?? null,
      trigger: request.trigger ?? null,
      attemptNumber: request.attemptNumber ?? null,
      paymentMethodId: request.paymentMethodId,
      externalUniqTranId: request.externalUniqTranId,
      amountAgorot: request.amountAgorot,
      currency: request.currency,
      ...extra,
    }));
  }
  /**
   * A definitive DECLINED outcome of a token-renewal attempt also applies the
   * bounded renewal-decline policy, atomically with the attempt write. UNKNOWN
   * and CAPTURED (and every hosted attempt) go through the plain path: an
   * uncertain charge is never treated as a decline.
   */
  private applyOutcome(
    attempt: BillingAttempt,
    input: Pick<ProviderRuntimeInput, 'leaseOwner'>,
    outcome: NormalizedChargeOutcome,
  ) {
    if (
      outcome.kind === 'DECLINED' &&
      attempt.trigger === BillingAttemptTrigger.RENEWAL &&
      attempt.chargeMode === BillingChargeMode.TOKEN_TRANSACTION
    ) {
      return this.orchestration.applyNormalizedOutcome(
        attempt.id,
        input.leaseOwner,
        attempt.stateVersion,
        outcome,
        new Date(),
        { renewalDeclinePolicy: true },
      );
    }
    return this.orchestration.applyNormalizedOutcome(
      attempt.id,
      input.leaseOwner,
      attempt.stateVersion,
      outcome,
    );
  }
  async reconcileCharge(
    input: ProviderRuntimeInput,
  ): Promise<ProviderRuntimeResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    const lease = await this.orchestration.claimForReconciliation(
      input.attemptId,
      input.leaseOwner,
      input.expectedStateVersion,
    );
    if (!lease.claimed)
      return {
        kind: 'NOT_CLAIMED',
        reason: lease.reason,
        attempt: lease.attempt,
      };
    const request: CardComChargeRequest = {
      attemptId: lease.attempt.id,
      paymentMethodId: lease.attempt.paymentMethodId,
      externalUniqTranId: lease.attempt.cardcomExternalUniqTranId,
      amountAgorot: lease.attempt.amountAgorot,
      currency: lease.attempt.currency,
      chargeMode: lease.attempt.chargeMode,
      lowProfileId: lease.attempt.cardcomLowProfileId,
      planId: lease.attempt.planId,
      firebaseId: input.actor.subjectFirebaseId,
      subscriptionId: input.subscriptionId ?? null,
    };
    let outcome: NormalizedChargeOutcome;
    try {
      outcome = normalizeCardComReconciliation(
        await this.executor.reconcileCharge(request),
      );
    } catch {
      outcome = { kind: 'UNKNOWN', failureCategory: 'RECONCILIATION_ERROR' };
    }
    const attempt = await this.applyOutcome(lease.attempt, input, outcome);
    return { kind: 'APPLIED', outcome, attempt };
  }

  /**
   * Customer-triggered, read-only lookup of an existing hosted checkout. It
   * can claim AWAITING_CUSTOMER as well as UNKNOWN, but never submits a charge
   * or creates another LowProfile page.
   */
  async inspectHostedCheckout(
    input: Omit<ProviderRuntimeInput, 'expectedStateVersion'>,
  ): Promise<ProviderRuntimeResult> {
    this.orchestration.assertOwnerMutation(input.actor);
    const lease = await this.orchestration.claimForHostedOutcome(
      input.attemptId,
      input.leaseOwner,
      input.actor.subjectFirebaseId,
    );
    if (!lease.claimed) {
      return { kind: 'NOT_CLAIMED', reason: lease.reason, attempt: lease.attempt };
    }
    const request: CardComChargeRequest = {
      attemptId: lease.attempt.id,
      paymentMethodId: lease.attempt.paymentMethodId,
      externalUniqTranId: lease.attempt.cardcomExternalUniqTranId,
      amountAgorot: lease.attempt.amountAgorot,
      currency: lease.attempt.currency,
      chargeMode: lease.attempt.chargeMode,
      lowProfileId: lease.attempt.cardcomLowProfileId,
      planId: lease.attempt.planId,
      firebaseId: input.actor.subjectFirebaseId,
      subscriptionId: input.subscriptionId ?? null,
    };
    let outcome: NormalizedChargeOutcome;
    try {
      outcome = normalizeCardComReconciliation(await this.executor.reconcileCharge(request));
    } catch {
      outcome = { kind: 'UNKNOWN', failureCategory: 'RECONCILIATION_ERROR' };
    }
    const attempt = await this.applyOutcome(lease.attempt, input, outcome);
    return { kind: 'APPLIED', outcome, attempt };
  }
}

/**
 * Reconciliation is read-only evidence gathering, so it is stricter than a
 * charge response: only a captured result (with its transaction id) or an
 * executor-proven decline changes the attempt. Any other non-zero code —
 * including "not found" — stays UNKNOWN, because it is not proof that no
 * charge happened.
 */
export function normalizeCardComReconciliation(
  response: CardComChargeResponse,
): NormalizedChargeOutcome {
  const outcome = normalizeCardComCharge(response);
  if (outcome.kind === 'UNKNOWN' && response.failureCategory) {
    return { ...outcome, failureCategory: response.failureCategory };
  }
  if (outcome.kind === 'DECLINED' && !response.definitiveDecline) {
    return {
      kind: 'UNKNOWN',
      providerResponseCode: outcome.providerResponseCode,
      providerDescription: response.providerDescription ?? null,
      failureCategory: response.failureCategory ?? 'UNVERIFIED_LOOKUP_RESULT',
    };
  }
  return outcome;
}

export function normalizeCardComCharge(
  response: CardComChargeResponse,
): NormalizedChargeOutcome {
  const code =
    response.responseCode == null ? null : Number(response.responseCode);
  if (code !== null && !Number.isFinite(code))
    return { kind: 'UNKNOWN', failureCategory: 'MALFORMED_PROVIDER_RESPONSE' };
  if (response.success === false && code === 0)
    return {
      kind: 'UNKNOWN',
      providerResponseCode: code,
      providerDescription: response.providerDescription ?? null,
      failureCategory: 'CONFLICTING_PROVIDER_RESPONSE',
    };
  const captured = response.success === true || code === 0;
  if (captured && response.transactionId)
    return {
      kind: 'CAPTURED',
      cardcomTransactionId: response.transactionId,
      providerTerminalRef: response.terminalRef ?? null,
      providerResponseCode: code,
      providerDescription: response.providerDescription ?? null,
    };
  if (captured || code == null)
    return {
      kind: 'UNKNOWN',
      providerResponseCode: code,
      failureCategory: 'INCOMPLETE_PROVIDER_RESPONSE',
    };
  return {
    kind: 'DECLINED',
    providerResponseCode: code,
    providerDescription: response.providerDescription ?? null,
    failureCategory: response.failureCategory ?? 'PROVIDER_DECLINED',
  };
}
