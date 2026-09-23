import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from '../entities/payment-method.entity';
import { decryptCardcomToken } from '../utils/billing-token-encryption.util';
import { CardcomService } from './cardcom.service';
import {
  BillingCardComExecutor,
  CardComChargeRequest,
  CardComChargeResponse,
} from './billing-provider-runtime.service';

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
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: request.paymentMethodId },
    });
    if (!paymentMethod) {
      throw new Error('Billing attempt payment method is missing');
    }
    if (!paymentMethod.cardExpiryMonth || !paymentMethod.cardExpiryYear) {
      throw new Error('Billing attempt payment method expiry is missing');
    }
    const response = await this.cardcomService.chargeByToken({
      token: decryptCardcomToken(paymentMethod.cardcomToken),
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

  async reconcileCharge(
    _request: CardComChargeRequest,
  ): Promise<CardComChargeResponse> {
    // There is no non-mutating CardCom lookup by ExternalUniqTranId here.
    // Never replay a token charge while reconciling an UNKNOWN attempt.
    throw new Error('CardCom transaction reconciliation is not available');
  }
}
