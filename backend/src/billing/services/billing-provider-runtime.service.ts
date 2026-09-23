import { Inject, Injectable } from '@nestjs/common';
import {
  BillingAttemptOrchestrationService,
  BillingMutationActorContext,
  NormalizedChargeOutcome,
} from './billing-attempt-orchestration.service';

export const BILLING_CARD_COM_EXECUTOR = Symbol('BILLING_CARD_COM_EXECUTOR');
export interface CardComChargeRequest {
  attemptId: number;
  paymentMethodId: number | null;
  externalUniqTranId: string;
  amountAgorot: number;
  currency: string;
}
export interface CardComChargeResponse {
  success?: boolean;
  responseCode?: number | string | null;
  transactionId?: string | null;
  terminalRef?: string | null;
  failureCategory?: string | null;
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
}
export type ProviderRuntimeResult =
  | { kind: 'NOT_CLAIMED'; reason?: string; attempt: unknown }
  | { kind: 'APPLIED'; outcome: NormalizedChargeOutcome; attempt: unknown };

@Injectable()
export class BillingProviderRuntimeService {
  constructor(
    private readonly orchestration: BillingAttemptOrchestrationService,
    @Inject(BILLING_CARD_COM_EXECUTOR)
    private readonly executor: BillingCardComExecutor,
  ) {}
  async submitCharge(
    input: ProviderRuntimeInput,
  ): Promise<ProviderRuntimeResult> {
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
    };
    let outcome: NormalizedChargeOutcome;
    try {
      outcome = normalizeCardComCharge(
        await this.executor.executeCharge(request),
      );
    } catch {
      outcome = { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' };
    }
    const attempt = await this.orchestration.applyNormalizedOutcome(
      lease.attempt.id,
      input.leaseOwner,
      lease.attempt.stateVersion,
      outcome,
    );
    return { kind: 'APPLIED', outcome, attempt };
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
    const request = {
      attemptId: lease.attempt.id,
      paymentMethodId: lease.attempt.paymentMethodId,
      externalUniqTranId: lease.attempt.cardcomExternalUniqTranId,
      amountAgorot: lease.attempt.amountAgorot,
      currency: lease.attempt.currency,
    };
    let outcome: NormalizedChargeOutcome;
    try {
      outcome = normalizeCardComCharge(
        await this.executor.reconcileCharge(request),
      );
    } catch {
      outcome = { kind: 'UNKNOWN', failureCategory: 'RECONCILIATION_ERROR' };
    }
    const attempt = await this.orchestration.applyNormalizedOutcome(
      lease.attempt.id,
      input.leaseOwner,
      lease.attempt.stateVersion,
      outcome,
    );
    return { kind: 'APPLIED', outcome, attempt };
  }
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
      failureCategory: 'CONFLICTING_PROVIDER_RESPONSE',
    };
  const captured = response.success === true || code === 0;
  if (captured && response.transactionId)
    return {
      kind: 'CAPTURED',
      cardcomTransactionId: response.transactionId,
      providerTerminalRef: response.terminalRef ?? null,
      providerResponseCode: code,
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
    failureCategory: response.failureCategory ?? 'PROVIDER_DECLINED',
  };
}
