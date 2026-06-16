import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingEventType } from '../enums/billing.enums';

export interface LogBillingEventInput {
  firebaseId: string;
  eventType: BillingEventType;
  subscriptionId?: number | null;
  paymentMethodId?: number | null;
  /** VAT-inclusive total in agorot. */
  amountAgorot?: number | null;
  /** Pre-VAT base in agorot. Set alongside amountAgorot on CHECKOUT_CREATED and PAYMENT_SUCCESS. */
  amountBeforeVatAgorot?: number | null;
  /** VAT component in agorot. amountBeforeVatAgorot + vatAmountAgorot === amountAgorot. */
  vatAmountAgorot?: number | null;
  currency?: string;
  cardcomDealNumber?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Append-only audit log for all billing actions.
 * All methods are fire-and-forget safe: they catch internally and NEVER
 * throw, so a logging failure can never break the main request flow.
 */
@Injectable()
export class BillingEventService {
  private readonly logger = new Logger(BillingEventService.name);

  constructor(
    @InjectRepository(BillingEvent)
    private readonly billingEventRepo: Repository<BillingEvent>,
  ) {}

  async logEvent(input: LogBillingEventInput): Promise<void> {
    try {
      const event = this.billingEventRepo.create({
        firebaseId: input.firebaseId,
        eventType: input.eventType,
        subscriptionId: input.subscriptionId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        amountAgorot: input.amountAgorot ?? null,
        amountBeforeVatAgorot: input.amountBeforeVatAgorot ?? null,
        vatAmountAgorot: input.vatAmountAgorot ?? null,
        currency: input.currency ?? 'ILS',
        cardcomDealNumber: input.cardcomDealNumber ?? null,
        metadata: input.metadata ?? null,
      });
      await this.billingEventRepo.save(event);
    } catch (error) {
      // Intentionally swallowed — billing event logging must never disrupt the
      // main payment flow. Errors are only surfaced in logs.
      this.logger.error(
        `Failed to persist billing event [${input.eventType}] for firebaseId=${input.firebaseId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }

  /**
   * Returns the VAT breakdown stored on the most recent CHECKOUT_CREATED event
   * for the given subscription. Used by the webhook handler to copy the canonical
   * amounts onto the PAYMENT_SUCCESS row without recalculating from the plan.
   *
   * Returns null if no matching event is found or the breakdown was not stored.
   */
  async findCheckoutBreakdown(subscriptionId: number): Promise<{
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    amountIncludingVatAgorot: number;
  } | null> {
    try {
      const event = await this.billingEventRepo.findOne({
        where: {
          subscriptionId,
          eventType: BillingEventType.CHECKOUT_CREATED,
        },
        order: { createdAt: 'DESC' },
        select: ['amountBeforeVatAgorot', 'vatAmountAgorot', 'amountAgorot'],
      });

      if (
        !event ||
        event.amountBeforeVatAgorot == null ||
        event.vatAmountAgorot == null ||
        event.amountAgorot == null
      ) {
        return null;
      }

      return {
        amountBeforeVatAgorot: event.amountBeforeVatAgorot,
        vatAmountAgorot: event.vatAmountAgorot,
        amountIncludingVatAgorot: event.amountAgorot,
      };
    } catch (error) {
      this.logger.error(
        `findCheckoutBreakdown failed for subscriptionId=${subscriptionId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  async updatePaymentEventWithReceipt(eventId: number, receiptDocId: number): Promise<void> {
    try {
      await this.billingEventRepo.update({ id: eventId }, { receiptDocId });
    } catch (error) {
      this.logger.error(
        `Failed to update billing event ${eventId} with receiptDocId=${receiptDocId}: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }

  async updatePaymentEventEmailSent(eventId: number, sentAt: Date): Promise<void> {
    try {
      await this.billingEventRepo.update({ id: eventId }, { receiptEmailSentAt: sentAt });
    } catch (error) {
      this.logger.error(
        `Failed to update billing event ${eventId} receiptEmailSentAt: ${(error as Error)?.message ?? error}`,
        (error as Error)?.stack,
      );
    }
  }
}
