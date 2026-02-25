import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackWebhookEvent } from './entities/feezback-webhook-event.entity';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';
import { computeFeezbackEventHash } from '../utils/feezback-event.utils';
import { extractFirebaseIdFromContext, parseFeezbackUserIdentifier } from '../utils/feezback-user.utils';
import { FeezbackConsentService } from '../consent/feezback-consent.service';
import { ConsentSyncService } from '../consent/consent-sync.service';

@Injectable()
export class FeezbackWebhookService {
  private readonly logger = new Logger(FeezbackWebhookService.name);

  constructor(
    @InjectRepository(FeezbackWebhookEvent)
    private readonly webhookRepository: Repository<FeezbackWebhookEvent>,
    private readonly consentService: FeezbackConsentService,
    private readonly consentSyncService: ConsentSyncService,
  ) {}

  async handleWebhook(body: FeezbackWebhookEventBody): Promise<void> {
    const eventType = body?.event ?? 'unknown';
    const payloadHash = computeFeezbackEventHash(body);

    const eventEntity = this.webhookRepository.create({
      eventType,
      payloadJson: body,
      payloadHash,
      processedAt: null,
      processingError: null,
    });

    try {
      await this.webhookRepository.save(eventEntity);
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505') {
        this.logger.debug(`Duplicate webhook payload received (hash=${payloadHash}). Skipping processing.`);
        return;
      }

      this.logger.error(`Failed to persist webhook payload: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
      await this.processEvent(eventEntity, body);
      await this.webhookRepository.update(eventEntity.id, {
        processedAt: new Date(),
        processingError: null,
      });
    } catch (error: any) {
      this.logger.error(`Error processing Feezback webhook: ${error?.message}`, error?.stack);
      await this.webhookRepository.update(eventEntity.id, {
        processedAt: new Date(),
        processingError: error?.message ?? 'Unknown error',
      });
      // Do not rethrow – webhook should still respond 200
    }
  }

  private async processEvent(event: FeezbackWebhookEvent, body: FeezbackWebhookEventBody): Promise<void> {
    switch (event.eventType) {
      case 'ConsentStatusChanged':
        await this.handleConsentStatusChanged(body);
        break;
      default:
        this.logger.debug(`Ignoring unsupported Feezback webhook event type: ${event.eventType}`);
    }
  }

  private async handleConsentStatusChanged(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('ConsentStatusChanged webhook missing payload data');
      return;
    }

    const consentId = typeof payload.consent === 'string' ? payload.consent : null;
    if (!consentId) {
      this.logger.warn('ConsentStatusChanged webhook missing consent identifier');
      return;
    }

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    const sub = userIdentifier?.split('@')?.[0] || (parsedUser.firebaseId ? `${parsedUser.firebaseId}_sub` : null);

    let firebaseId = parsedUser.firebaseId;
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
    }

    const tppId = parsedUser.tppId ?? (typeof payload.tpp === 'string' ? payload.tpp : null);

    if (!firebaseId || !tppId || !sub) {
      this.logger.warn(`ConsentStatusChanged webhook missing identifiers. firebaseId=${firebaseId} tppId=${tppId} sub=${sub}`);
      return;
    }

    const currentStatus = typeof payload.currentStatus === 'string' ? payload.currentStatus : null;
    const now = new Date();

    try {
      const consent = await this.consentService.findByConsentId(consentId, tppId);
      if (consent) {
        await this.consentService.updateConsent(consent, {
          status: currentStatus ?? consent.status,
          metaJson: payload,
          lastSyncAt: now,
          rawLastWebhookJson: body,
        });
      } else {
        this.logger.warn(`ConsentStatusChanged webhook could not find consent record for consentId=${consentId}, tppId=${tppId}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed updating consent ${consentId}: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
      await this.consentSyncService.syncUserConsents(firebaseId, sub, tppId);
    } catch (error: any) {
      this.logger.error(`Consent reconciliation failed for firebaseId=${firebaseId}, sub=${sub}: ${error?.message}`, error?.stack);
      throw error;
    }
  }
}
