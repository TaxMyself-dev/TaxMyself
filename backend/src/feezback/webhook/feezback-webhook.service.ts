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
import { ModuleName, PayStatus, SourceType } from '../../enum';
import { UserModuleSubscription } from '../../users/user-module-subscription.entity';

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
    @InjectRepository(UserModuleSubscription)
    private readonly moduleSubRepo: Repository<UserModuleSubscription>,
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

    try {
      await this.webhookRepository.save(eventEntity);
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505') {
        this.logger.log(`[FeezbackWebhook] Duplicate payload — skipping hash=${payloadHash} eventType=${eventType}`);
        return;
      }
      this.logger.error(`[FeezbackWebhook] Failed to persist event=${eventType}: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
      await this.processEvent(eventEntity, body);
      await this.webhookRepository.update(eventEntity.id, { processedAt: new Date(), processingError: null });
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook] Error processing event=${eventType}: ${error?.message}`, error?.stack);
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
      case 'DataRefreshComplete':
        this.logger.log('[FeezbackWebhook] Handling DataRefreshComplete as data-ready trigger');
        await this.handleUserDataIsAvailable(body);
        break;
      default:
        this.logger.log(`[FeezbackWebhook] Ignoring unsupported event type=${event.eventType}`);
    }
  }

  private async handleConsentStatusChanged(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('[FeezbackWebhook][ConsentStatusChanged] Missing payload data');
      return;
    }

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
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
    }

    const tppId = parsedUser.tppId ?? (typeof payload.tpp === 'string' ? payload.tpp : null);
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');

    if (!firebaseId || !tppId || !sub) {
      this.logger.warn(
        `[FeezbackWebhook][ConsentStatusChanged] Missing required identifiers — aborting. firebaseId=${masked} tppId=${tppId ?? 'none'} sub=${sub ?? 'none'}`,
      );
      return;
    }

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
        this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] Consent updated consentId=${consentId}`);
      } else {
        this.logger.warn(`[FeezbackWebhook][ConsentStatusChanged] Consent row NOT found consentId=${consentId} tppId=${tppId}`);
      }
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] Failed updating consent consentId=${consentId}: ${error?.message}`, error?.stack);
      throw error;
    }

    try {
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

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    const sub = userIdentifier?.split('@')?.[0] || (parsedUser.firebaseId ? `${parsedUser.firebaseId}_sub` : null);

    let firebaseId = parsedUser.firebaseId;
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
    }

    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');

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

    // Pre-mark sync as running immediately so the frontend polling sees 'running'
    // even while sources are still being fetched/persisted below.
    void this.feezbackService.markSyncRunning(firebaseId);

    // Resolve internal User entity — needed for source persistence and moduleAccess update.
    let user: User | null = null;
    try {
      user = await this.userRepository.findOne({ where: { firebaseId } });
      if (!user) {
        this.logger.warn(`${prefix} Internal user NOT found firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to resolve user firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    const userName = user ? [user.fName, user.lName].filter(Boolean).join(' ') : masked;

    // Accumulators for clean summary print
    const bankResults: { sourceName: string; action: 'created' | 'updated' }[] = [];
    const cardResults: { sourceName: string; action: 'created' | 'updated' }[] = [];
    let bankError: string | null = null;
    let cardError: string | null = null;
    let moduleAccessUpdated = false;

    // Fetch and persist bank accounts into sources table.
    try {
      const accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true });
      const accounts: any[] = accountsResponse?.accounts ?? [];

      for (const account of accounts) {
        const resourceId: string = account?.resourceId ?? 'unknown';
        const iban: string | undefined = account?.iban;

        if (!iban || iban.trim() === '') {
          this.logger.warn(`${prefix}[Account] Skipping account — no IBAN resourceId=${resourceId}`);
          continue;
        }

        const sourceName = iban.trim().slice(-7);
        const feezbackResourceId: string | null = account?.resourceId ?? null;

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceName },
        });

        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          existing.sourceType = SourceType.BANK_ACCOUNT;
          await this.sourceRepository.save(existing);
          bankResults.push({ sourceName, action: 'updated' });
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
          bankResults.push({ sourceName, action: 'created' });
        }
      }
    } catch (error: any) {
      bankError = error?.message ?? 'unknown';
      this.logger.error(`${prefix}[Account] Sync failed firebaseId=${masked}: ${bankError}`, error?.stack);
    }

    // Fetch and persist credit cards into sources table.
    try {
      const cardsResponse = await this.feezbackApiService.getUserCards(sub, { withBalances: false });
      const cards: any[] = cardsResponse?.cards ?? [];

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

        const existing = await this.sourceRepository.findOne({
          where: { userId: firebaseId, sourceName },
        });

        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          existing.sourceType = SourceType.CREDIT_CARD;
          await this.sourceRepository.save(existing);
          cardResults.push({ sourceName, action: 'updated' });
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
          cardResults.push({ sourceName, action: 'created' });
        }
      }
    } catch (error: any) {
      cardError = error?.message ?? 'unknown';
      this.logger.error(`${prefix}[Card] Sync failed firebaseId=${masked}: ${cardError}`, error?.stack);
    }

    // Ensure user.modulesAccess includes OPEN_BANKING, set hasOpenBanking=true,
    // and create the OPEN_BANKING module subscription record if not already present.
    try {
      if (user) {
        let dirty = false;

        if (!user.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
          user.modulesAccess = [...(user.modulesAccess ?? []), ModuleName.OPEN_BANKING];
          dirty = true;
        }

        if (!user.hasOpenBanking) {
          user.hasOpenBanking = true;
          dirty = true;
        }

        if (dirty) {
          await this.userRepository.save(user);
          moduleAccessUpdated = true;
        }

        const existingOBSub = await this.moduleSubRepo.findOne({
          where: { firebaseId, moduleName: ModuleName.OPEN_BANKING },
        });
        if (!existingOBSub) {
          const trialStart = new Date();
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 45);
          await this.moduleSubRepo.save(
            this.moduleSubRepo.create({
              firebaseId,
              moduleName: ModuleName.OPEN_BANKING,
              trialStartDate: trialStart,
              trialEndDate: trialEnd,
              payStatus: PayStatus.TRIAL,
              monthlyPriceNis: 45,
              createdAt: new Date(),
            }),
          );
        }
      } else {
        this.logger.warn(`${prefix} Skipping modulesAccess/hasOpenBanking update — user not found firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to update modulesAccess/hasOpenBanking firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    // ── Consolidated summary print ────────────────────────────────────────────
    console.log(`\n════════════════════════════════════`);
    console.log(`  SOURCE SYNC  (${eventType})`);
    console.log(`  User : ${userName}`);
    console.log(`════════════════════════════════════`);
    if (bankError) {
      console.log(`  ✗ Bank  — ERROR: ${bankError}`);
    } else {
      console.log(`  ✓ Bank  — ${bankResults.length} account(s)`);
      bankResults.forEach(r => console.log(`      ${r.sourceName}  [${r.action}]`));
    }
    if (cardError) {
      console.log(`  ✗ Cards — ERROR: ${cardError}`);
    } else {
      console.log(`  ✓ Cards — ${cardResults.length} card(s)`);
      cardResults.forEach(r => console.log(`      ${r.sourceName}  [${r.action}]`));
    }
    if (moduleAccessUpdated) console.log(`  ✓ Module access updated`);
    console.log(`════════════════════════════════════\n`);

    void this.feezbackService.triggerFullSync(firebaseId, 'webhook')
      .catch(err => this.logger.error(`${prefix} triggerFullSync failed firebaseId=${masked}`, err?.stack ?? err));
  }
}
