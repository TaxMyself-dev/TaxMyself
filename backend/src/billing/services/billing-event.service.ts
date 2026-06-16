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
  amountAgorot?: number | null;
  currency?: string;
  cardcomDealNumber?: string | null;
  cardcomDocumentNumber?: string | null;
  cardcomDocumentType?: string | null;
  cardcomDocumentUrl?: string | null;
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
        currency: input.currency ?? 'ILS',
        cardcomDealNumber: input.cardcomDealNumber ?? null,
        cardcomDocumentNumber: input.cardcomDocumentNumber ?? null,
        cardcomDocumentType: input.cardcomDocumentType ?? null,
        cardcomDocumentUrl: input.cardcomDocumentUrl ?? null,
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
}
