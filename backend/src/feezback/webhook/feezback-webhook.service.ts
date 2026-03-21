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
import { FeezbackService } from '../feezback.service';
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
    private readonly feezbackService: FeezbackService,
  ) {}

  async handleWebhook(body: any): Promise<void> {
    const eventType = body?.event ?? 'unknown';
    const payloadHash = computeFeezbackEventHash(body);

    this.logger.log(`[FeezbackWebhook] Processing event=${eventType} hash=${payloadHash}`);

    const eventEntity = this.webhookRepository.create({
      eventType,
      payloadJson: body,
      payloadHash,
      processedAt: null,
      processingError: null,
    });

    this.logger.debug(`[FeezbackWebhook] Inserting webhook event row eventType=${eventType} hash=${payloadHash}`);

    try {
      await this.webhookRepository.save(eventEntity);
      this.logger.log(`[FeezbackWebhook] Webhook event row inserted id=${eventEntity.id} eventType=${eventType}`);
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505') {
        this.logger.log(`[FeezbackWebhook] Duplicate payload detected — skipping processing hash=${payloadHash} eventType=${eventType}`);
        return;
      }

      this.logger.error(`[FeezbackWebhook] Failed to persist event=${eventType}: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
      await this.processEvent(eventEntity, body);
      await this.webhookRepository.update(eventEntity.id, {
        processedAt: new Date(),
        processingError: null,
      });
      this.logger.debug(`[FeezbackWebhook] processedAt updated id=${eventEntity.id} eventType=${eventType}`);
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook] Error processing event=${eventType}: ${error?.message}`, error?.stack);
      await this.webhookRepository.update(eventEntity.id, {
        processedAt: new Date(),
        processingError: error?.message ?? 'Unknown error',
      });
      this.logger.debug(`[FeezbackWebhook] processingError updated id=${eventEntity.id} eventType=${eventType}`);
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
        this.logger.debug(`[FeezbackWebhook] Ignoring unsupported event type=${event.eventType}`);
    }
  }

  private async handleConsentStatusChanged(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('[FeezbackWebhook][ConsentStatusChanged] Missing payload data');
      return;
    }

    // Log raw identifiers before parsing
    const rawContext = typeof payload.context === 'string'
      ? payload.context.substring(0, 40) + (payload.context.length > 40 ? '...' : '')
      : 'none';
    this.logger.debug(
      `[FeezbackWebhook][ConsentStatusChanged] Raw identifiers user=${payload.user ?? 'none'} tpp=${payload.tpp ?? 'none'} context=${rawContext}`,
    );

    const consentId = typeof payload.consent === 'string' ? payload.consent : null;
    if (!consentId) {
      this.logger.warn('[FeezbackWebhook][ConsentStatusChanged] Missing consent identifier in payload');
      return;
    }

    const currentStatus = typeof payload.currentStatus === 'string' ? payload.currentStatus : null;
    this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] consentId=${consentId} currentStatus=${currentStatus ?? 'none'}`);

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    const sub = userIdentifier?.split('@')?.[0] || (parsedUser.firebaseId ? `${parsedUser.firebaseId}_sub` : null);

    let firebaseId = parsedUser.firebaseId;
    let firebaseIdSource = 'payload.user';
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
      if (firebaseId) firebaseIdSource = 'payload.context (fallback)';
    }

    const tppId = parsedUser.tppId ?? (typeof payload.tpp === 'string' ? payload.tpp : null);
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');

    this.logger.log(
      `[FeezbackWebhook][ConsentStatusChanged][Identifiers] firebaseId=${masked} source=${firebaseIdSource} sub=${sub ?? 'none'} tppId=${tppId ?? 'none'}`,
    );

    if (!firebaseId || !tppId || !sub) {
      this.logger.warn(
        `[FeezbackWebhook][ConsentStatusChanged] Missing required identifiers — aborting. firebaseId=${masked} tppId=${tppId ?? 'none'} sub=${sub ?? 'none'}`,
      );
      return;
    }

    const now = new Date();

    try {
      this.logger.debug(`[FeezbackWebhook][ConsentStatusChanged] Looking up consent row consentId=${consentId} tppId=${tppId}`);
      const consent = await this.consentService.findByConsentId(consentId, tppId);
      if (consent) {
        this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] Consent found consentId=${consentId} — updating status to ${currentStatus ?? 'unchanged'}`);
        await this.consentService.updateConsent(consent, {
          status: currentStatus ?? consent.status,
          metaJson: payload,
          lastSyncAt: now,
          rawLastWebhookJson: body,
        });
        this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] Consent updated consentId=${consentId}`);
      } else {
        this.logger.warn(`[FeezbackWebhook][ConsentStatusChanged] Consent row NOT found consentId=${consentId} tppId=${tppId}`);
      }
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] Failed updating consent consentId=${consentId}: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
      this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] Starting consent sync firebaseId=${masked} sub=${sub} tppId=${tppId}`);
      await this.consentSyncService.syncUserConsents(firebaseId, sub, tppId);
      this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] Consent sync completed firebaseId=${masked}`);
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] Consent sync failed firebaseId=${masked}: ${error?.message}`, error?.stack);
      throw error;
    }

    await this.syncUserSourcesAndAccess(firebaseId, sub, 'ConsentStatusChanged');
  }

  private async handleUserDataIsAvailable(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('[FeezbackWebhook][UserDataIsAvailable] Missing payload data');
      return;
    }

    const rawContext = typeof payload.context === 'string'
      ? payload.context.substring(0, 40) + (payload.context.length > 40 ? '...' : '')
      : 'none';
    this.logger.debug(
      `[FeezbackWebhook][UserDataIsAvailable] Raw identifiers user=${payload.user ?? 'none'} tpp=${payload.tpp ?? 'none'} context=${rawContext}`,
    );

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    const sub = userIdentifier?.split('@')?.[0] || (parsedUser.firebaseId ? `${parsedUser.firebaseId}_sub` : null);

    let firebaseId = parsedUser.firebaseId;
    let firebaseIdSource = 'payload.user';
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
      if (firebaseId) firebaseIdSource = 'payload.context (fallback)';
    }

    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');
    this.logger.log(
      `[FeezbackWebhook][UserDataIsAvailable][Identifiers] firebaseId=${masked} source=${firebaseIdSource} sub=${sub ?? 'none'}`,
    );

    if (!firebaseId || !sub) {
      this.logger.warn(
        `[FeezbackWebhook][UserDataIsAvailable] Missing required identifiers — aborting. firebaseId=${masked} sub=${sub ?? 'none'}`,
      );
      return;
    }

    await this.syncUserSourcesAndAccess(firebaseId, sub, 'UserDataIsAvailable');
  }

  // Shared sync logic: resolve user, persist accounts/cards into sources, update moduleAccess.
  // Called by both ConsentStatusChanged and UserDataIsAvailable handlers.
  // Always fetches fresh data from the Feezback API — does not use payload.fetchedAccounts.
  private async syncUserSourcesAndAccess(firebaseId: string, sub: string, eventType: string): Promise<void> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');
    const prefix = `[FeezbackSourceSync][${eventType}]`;

    // Resolve internal User entity — needed for source persistence and moduleAccess update.
    let user: User | null = null;
    try {
      this.logger.debug(`${prefix} Looking up internal user firebaseId=${masked}`);
      user = await this.userRepository.findOne({ where: { firebaseId } });
      if (!user) {
        this.logger.warn(`${prefix} Internal user NOT found firebaseId=${masked}`);
      } else {
        this.logger.log(`${prefix} Internal user found firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to resolve user firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    // Fetch and persist bank accounts into sources table.
    // NOTE: payload.fetchedAccounts is intentionally NOT used — always fetches fresh from Feezback API.
    try {
      this.logger.log(`${prefix}[Account] Fetching accounts from Feezback API sub=${sub} (payload.fetchedAccounts NOT used)`);
      const accountsResponse = await this.feezbackApiService.getUserAccounts(sub);
      const accounts: any[] = accountsResponse?.accounts ?? [];
      this.logger.log(`${prefix}[Account] Fetched ${accounts.length} account(s) firebaseId=${masked}`);

      for (const account of accounts) {
        const resourceId: string = account?.resourceId ?? 'unknown';
        const iban: string | undefined = account?.iban;

        if (!iban || iban.trim() === '') {
          this.logger.warn(`${prefix}[Account] Skipping account — no IBAN resourceId=${resourceId}`);
          continue;
        }

        const sourceName = iban.trim().slice(-7);
        const feezbackResourceId: string | null = account?.resourceId ?? null;

        this.logger.debug(`${prefix}[Account] Processing resourceId=${resourceId} iban=***${sourceName} sourceName=${sourceName}`);

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceType: SourceType.BANK_ACCOUNT, sourceName },
        });

        if (existing) {
          const resourceIdChanged = existing.feezbackResourceId !== feezbackResourceId;
          existing.feezbackResourceId = feezbackResourceId;
          await this.sourceRepository.save(existing);
          this.logger.log(`${prefix}[Account] Updated source id=${existing.id} sourceName=${sourceName} resourceIdChanged=${resourceIdChanged}`);
        } else {
          const created = await this.sourceRepository.save(
            this.sourceRepository.create({
              userId: firebaseId,
              sourceName,
              sourceType: SourceType.BANK_ACCOUNT,
              feezbackResourceId,
              bill: null,
            }),
          );
          this.logger.log(`${prefix}[Account] Created source id=${created.id} sourceName=${sourceName} resourceId=${feezbackResourceId}`);
        }
      }

      this.logger.log(`${prefix}[Account] Sync complete — processed ${accounts.length} account(s) firebaseId=${masked}`);
    } catch (error: any) {
      this.logger.error(`${prefix}[Account] Sync failed firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    // Fetch and persist credit cards into sources table.
    // NOTE: payload.fetchedAccounts is intentionally NOT used — always fetches fresh from Feezback API.
    try {
      this.logger.log(`${prefix}[Card] Fetching cards from Feezback API sub=${sub} (payload.fetchedAccounts NOT used)`);
      const cardsResponse = await this.feezbackApiService.getUserCards(sub, { withBalances: false });
      const cards: any[] = cardsResponse?.cards ?? [];
      this.logger.log(`${prefix}[Card] Fetched ${cards.length} card(s) firebaseId=${masked}`);

      for (const card of cards) {
        const resourceId: string = card?.resourceId ?? 'unknown';
        const maskedPan: string | undefined = card?.maskedPan;
        const last4Match = typeof maskedPan === 'string' ? maskedPan.match(/(\d{4})$/) : null;

        if (!last4Match) {
          this.logger.warn(`${prefix}[Card] Skipping card — cannot extract last-4 resourceId=${resourceId} maskedPan=${maskedPan ?? 'none'}`);
          continue;
        }

        const sourceName = last4Match[1];
        const feezbackResourceId: string | null = card?.resourceId ?? null;

        this.logger.debug(`${prefix}[Card] Processing resourceId=${resourceId} maskedPan=***${sourceName} sourceName=${sourceName}`);

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceType: SourceType.CREDIT_CARD, sourceName },
        });

        if (existing) {
          const resourceIdChanged = existing.feezbackResourceId !== feezbackResourceId;
          existing.feezbackResourceId = feezbackResourceId;
          await this.sourceRepository.save(existing);
          this.logger.log(`${prefix}[Card] Updated source id=${existing.id} sourceName=${sourceName} resourceIdChanged=${resourceIdChanged}`);
        } else {
          const created = await this.sourceRepository.save(
            this.sourceRepository.create({
              userId: firebaseId,
              sourceName,
              sourceType: SourceType.CREDIT_CARD,
              feezbackResourceId,
              bill: null,
            }),
          );
          this.logger.log(`${prefix}[Card] Created source id=${created.id} sourceName=${sourceName} resourceId=${feezbackResourceId}`);
        }
      }

      this.logger.log(`${prefix}[Card] Sync complete — processed ${cards.length} card(s) firebaseId=${masked}`);
    } catch (error: any) {
      this.logger.error(`${prefix}[Card] Sync failed firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    // Ensure user.modulesAccess includes OPEN_BANKING.
    try {
      if (user) {
        if (user.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
          this.logger.debug(`${prefix} OPEN_BANKING already in modulesAccess — no update needed firebaseId=${masked}`);
        } else {
          user.modulesAccess = [...(user.modulesAccess ?? []), ModuleName.OPEN_BANKING];
          await this.userRepository.save(user);
          this.logger.log(`${prefix} Added OPEN_BANKING to modulesAccess and saved firebaseId=${masked}`);
        }
      } else {
        this.logger.warn(`${prefix} Skipping modulesAccess update — user not found firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to update modulesAccess firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    // Log #17 — trigger full transaction sync fire-and-forget
    this.logger.log(`${prefix} Triggering fire-and-forget full sync firebaseId=${masked} eventType=${eventType}`);
    // Log #15 (failure) is in the .catch below
    void this.feezbackService.triggerFullSync(firebaseId, 'webhook')
      .catch(err => this.logger.error(`${prefix} triggerFullSync failed firebaseId=${masked}`, err?.stack ?? err));
  }
}
