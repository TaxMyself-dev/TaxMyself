import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackWebhookEvent } from './entities/feezback-webhook-event.entity';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';
import { computeFeezbackEventHash } from '../utils/feezback-event.utils';
import { extractFirebaseIdFromContext, parseFeezbackUserIdentifier } from '../utils/feezback-user.utils';
import { FeezbackConsentService } from '../consent/feezback-consent.service';
import { ConsentSyncService } from '../consent/consent-sync.service';
import { FeezbackApiService } from '../api/feezback-api.service';
import { User } from '../../users/user.entity';
import { Source } from '../../transactions/source.entity';
import { ModuleName, SourceType } from '../../enum';

@Injectable()
export class FeezbackWebhookService {
  private readonly logger = new Logger(FeezbackWebhookService.name);

  constructor(
    @InjectRepository(FeezbackWebhookEvent)
    private readonly webhookRepository: Repository<FeezbackWebhookEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Source)
    private readonly sourceRepository: Repository<Source>,
    private readonly consentService: FeezbackConsentService,
    private readonly consentSyncService: ConsentSyncService,
    private readonly feezbackApiService: FeezbackApiService,
  ) {}

  async handleWebhook(body: any): Promise<void> {
    console.log("🚀 ~ FeezbackWebhookService ~ handleWebhook ~ body:", body);
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
      case 'UserDataIsAvailable':
        await this.handleUserDataIsAvailable(body);
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

    await this.syncUserSourcesAndAccess(firebaseId, sub, 'ConsentStatusChanged');
  }

  private async handleUserDataIsAvailable(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('UserDataIsAvailable webhook missing payload data');
      return;
    }

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    const sub = userIdentifier?.split('@')?.[0] || (parsedUser.firebaseId ? `${parsedUser.firebaseId}_sub` : null);

    let firebaseId = parsedUser.firebaseId;
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
    }

    if (!firebaseId || !sub) {
      this.logger.warn(`UserDataIsAvailable webhook missing identifiers. firebaseId=${firebaseId} sub=${sub}`);
      return;
    }

    await this.syncUserSourcesAndAccess(firebaseId, sub, 'UserDataIsAvailable');
  }

  // Shared sync logic: resolve user, persist accounts/cards into sources, update moduleAccess.
  // Called by both ConsentStatusChanged and UserDataIsAvailable handlers.
  // Always fetches fresh data from the Feezback API — does not use payload.fetchedAccounts.
  private async syncUserSourcesAndAccess(firebaseId: string, sub: string, eventType: string): Promise<void> {
    // Resolve internal User entity — needed for source persistence and moduleAccess update.
    let user: User | null = null;
    try {
      user = await this.userRepository.findOne({ where: { firebaseId } });
      if (!user) {
        this.logger.warn(`${eventType}: no internal user found for firebaseId=${firebaseId}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to resolve user for firebaseId=${firebaseId}: ${error?.message}`, error?.stack);
    }

    // Fetch and persist bank accounts into sources table.
    try {
      const accountsResponse = await this.feezbackApiService.getUserAccounts(sub);
      const accounts: any[] = accountsResponse?.accounts ?? [];

      for (const account of accounts) {
        const iban: string | undefined = account?.iban;
        if (!iban || iban.trim() === '') {
          this.logger.warn(`Skipping bank account without IBAN. resourceId=${account?.resourceId ?? 'unknown'}`);
          continue;
        }

        const sourceName = iban.trim().slice(-7);
        const feezbackResourceId: string | null = account?.resourceId ?? null;

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceType: SourceType.BANK_ACCOUNT, sourceName },
        });

        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          await this.sourceRepository.save(existing);
        } else {
          await this.sourceRepository.save(
            this.sourceRepository.create({
              userId: firebaseId,
              sourceName,
              sourceType: SourceType.BANK_ACCOUNT,
              feezbackResourceId,
              bill: null,
            }),
          );
        }
      }

      this.logger.log(`Bank account sync complete for firebaseId=${firebaseId}. Processed ${accounts.length} account(s).`);
    } catch (error: any) {
      this.logger.error(`Bank account sync failed for firebaseId=${firebaseId}: ${error?.message}`, error?.stack);
    }

    // Fetch and persist credit cards into sources table.
    try {
      const cardsResponse = await this.feezbackApiService.getUserCards(sub, { withBalances: false });
      const cards: any[] = cardsResponse?.cards ?? [];

      for (const card of cards) {
        const maskedPan: string | undefined = card?.maskedPan;
        const last4Match = typeof maskedPan === 'string' ? maskedPan.match(/(\d{4})$/) : null;

        if (!last4Match) {
          this.logger.warn(`Skipping card without extractable last-4 maskedPan. resourceId=${card?.resourceId ?? 'unknown'}`);
          continue;
        }

        const sourceName = last4Match[1];
        const feezbackResourceId: string | null = card?.resourceId ?? null;

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceType: SourceType.CREDIT_CARD, sourceName },
        });

        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          await this.sourceRepository.save(existing);
        } else {
          await this.sourceRepository.save(
            this.sourceRepository.create({
              userId: firebaseId,
              sourceName,
              sourceType: SourceType.CREDIT_CARD,
              feezbackResourceId,
              bill: null,
            }),
          );
        }
      }

      this.logger.log(`Card sync complete for firebaseId=${firebaseId}. Processed ${cards.length} card(s).`);
    } catch (error: any) {
      this.logger.error(`Card sync failed for firebaseId=${firebaseId}: ${error?.message}`, error?.stack);
    }

    // Ensure user.modulesAccess includes OPEN_BANKING.
    try {
      if (user && !user.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
        user.modulesAccess = [...(user.modulesAccess ?? []), ModuleName.OPEN_BANKING];
        await this.userRepository.save(user);
        this.logger.log(`Added OPEN_BANKING module access for firebaseId=${firebaseId}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to update modulesAccess for firebaseId=${firebaseId}: ${error?.message}`, error?.stack);
    }
  }
}
