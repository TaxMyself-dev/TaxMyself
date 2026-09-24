import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from '../entities/payment-method.entity';
import { BillingChargeMode } from '../enums/billing.enums';
import {
  isDefinitiveHostedDecline,
  validateHostedTransactionResult,
} from '../utils/billing-hosted-card-result.util';
import { decryptCardcomToken } from '../utils/billing-token-encryption.util';
import { CardcomService } from './cardcom.service';
import {
  BillingCardComExecutor,
  BillingPreSubmissionError,
  CardComChargeRequest,
  CardComChargeResponse,
} from './billing-provider-runtime.service';

/** ILS in CardCom's CoinId list. */
const ILS_COIN_ID = 1;

/** Provider-boundary adapter for canonical token renewals. */
@Injectable()
export class BillingCardcomExecutorService implements BillingCardComExecutor {
  constructor(
    private readonly cardcomService: CardcomService,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async executeCharge(
    request: CardComChargeRequest,
  ): Promise<CardComChargeResponse> {
    // Everything up to chargeByToken is local: a failure here means no request
    // reached CardCom, so it is reported as a pre-submission failure.
    if (request.paymentMethodId == null) {
      throw new BillingPreSubmissionError(
        'Billing attempt payment method is missing',
      );
    }
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: request.paymentMethodId },
    });
    if (!paymentMethod) {
      throw new BillingPreSubmissionError(
        'Billing attempt payment method is missing',
      );
    }
    if (!paymentMethod.cardExpiryMonth || !paymentMethod.cardExpiryYear) {
      throw new BillingPreSubmissionError(
        'Billing attempt payment method expiry is missing',
      );
    }
    let token: string;
    try {
      token = decryptCardcomToken(paymentMethod.cardcomToken);
    } catch {
      throw new BillingPreSubmissionError(
        'Billing attempt payment method token is unusable',
      );
    }
    const response = await this.cardcomService.chargeByToken({
      token,
      cardExpirationMMYY: `${String(paymentMethod.cardExpiryMonth).padStart(
        2,
        '0',
      )}${String(paymentMethod.cardExpiryYear).slice(-2)}`,
      amountAgorot: request.amountAgorot,
      externalUniqTranId: request.externalUniqTranId,
    });
    return {
      success: response.ResponseCode === 0,
      responseCode: response.ResponseCode ?? null,
      transactionId:
        response.TranzactionId == null ? null : String(response.TranzactionId),
      terminalRef: response.ApprovalNumber ?? null,
      failureCategory: response.ResponseCode === 0 ? null : 'PROVIDER_DECLINED',
    };
  }

  /**
   * Read-only reconciliation. Never charges, creates a checkout, refunds or
   * voids: token attempts use the documented lookup by ExternalUniqTranId and
   * hosted attempts the existing LowProfile result lookup. Only a verified
   * capture (or, for hosted, a verified decline) is reported as such; every
   * other result — including "not found" — is unresolved, never a decline.
   */
  async reconcileCharge(
    request: CardComChargeRequest,
  ): Promise<CardComChargeResponse> {
    switch (request.chargeMode) {
      case BillingChargeMode.TOKEN_TRANSACTION:
        return this.reconcileTokenAttempt(request);
      case BillingChargeMode.LOW_PROFILE_HOSTED:
        return this.reconcileHostedAttempt(request);
      default:
        throw new Error('Billing attempt charge mode cannot be reconciled');
    }
  }

  private async reconcileTokenAttempt(
    request: CardComChargeRequest,
  ): Promise<CardComChargeResponse> {
    const info = await this.cardcomService.getTransactionByExternalUniqTran(
      request.externalUniqTranId,
    );
    const unresolved = (
      failureCategory: string,
      responseCode: number | null = null,
    ): CardComChargeResponse => ({
      success: false,
      responseCode,
      failureCategory,
    });
    if (!info || typeof info !== 'object') {
      return unresolved('LOOKUP_MALFORMED_RESPONSE');
    }
    if (typeof info.ResponseCode !== 'number' || info.ResponseCode !== 0) {
      // Not found, declined, pending, unsupported: none is proof of "no charge".
      return unresolved(
        'LOOKUP_NOT_CONFIRMED',
        typeof info.ResponseCode === 'number' &&
          Number.isFinite(info.ResponseCode)
          ? info.ResponseCode
          : null,
      );
    }
    const transactionId = info.TranzactionId;
    if (
      typeof transactionId !== 'number' ||
      !Number.isSafeInteger(transactionId) ||
      transactionId <= 0
    ) {
      return unresolved('LOOKUP_MISSING_TRANSACTION_ID');
    }
    if (
      typeof info.Amount !== 'number' ||
      !Number.isFinite(info.Amount) ||
      Math.round(info.Amount * 100) !== request.amountAgorot
    ) {
      return unresolved('LOOKUP_AMOUNT_MISMATCH');
    }
    if (
      info.TerminalNumber != null &&
      Number(info.TerminalNumber) !==
        this.cardcomService.getApiCredentials().terminalNumber
    ) {
      return unresolved('LOOKUP_TERMINAL_MISMATCH');
    }
    if (
      info.IsRefund === true ||
      (info.CoinId != null && info.CoinId !== ILS_COIN_ID)
    ) {
      return unresolved('LOOKUP_NOT_A_MATCHING_CHARGE');
    }
    return {
      success: true,
      responseCode: 0,
      transactionId: String(transactionId),
      terminalRef: info.ApprovalNumber ?? null,
      failureCategory: null,
    };
  }

  private async reconcileHostedAttempt(
    request: CardComChargeRequest,
  ): Promise<CardComChargeResponse> {
    const unresolved = (failureCategory: string): CardComChargeResponse => ({
      success: false,
      responseCode: null,
      failureCategory,
    });
    if (!request.lowProfileId) return unresolved('NO_LOW_PROFILE_ID');
    if (
      request.subscriptionId == null ||
      request.firebaseId == null ||
      request.planId == null
    ) {
      return unresolved('MISSING_ATTEMPT_CONTEXT');
    }
    const result = await this.cardcomService.getLowProfileResult(
      request.lowProfileId,
    );
    const expected = {
      lowProfileId: request.lowProfileId,
      amountAgorot: request.amountAgorot,
      firebaseId: request.firebaseId,
      subscriptionId: request.subscriptionId,
      planId: request.planId,
      billingAttemptId: request.attemptId,
      terminalNumber: this.cardcomService.getApiCredentials().terminalNumber,
    };
    const captured = validateHostedTransactionResult(result, expected);
    if ('transactionId' in captured) {
      return {
        success: true,
        responseCode: 0,
        transactionId: captured.transactionId,
        terminalRef: null,
        failureCategory: null,
      };
    }
    const decline = isDefinitiveHostedDecline(result, expected);
    if (decline) {
      return {
        success: false,
        responseCode: decline.responseCode,
        failureCategory: 'PROVIDER_DECLINED',
        definitiveDecline: true,
      };
    }
    return unresolved(`HOSTED_${captured.reason}`);
  }
}
