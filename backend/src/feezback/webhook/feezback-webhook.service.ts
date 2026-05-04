import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackWebhookEvent } from './entities/feezback-webhook-event.entity';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';
import { computeFeezbackEventHash } from '../utils/feezback-event.utils';
import { extractFirebaseIdFromContext, parseFeezbackUserIdentifier } from '../utils/feezback-user.utils';
import { FeezbackConsentService } from '../consent/feezback-consent.service';
import { ConsentSyncService } from '../consent/consent-sync.service';
import { FeezbackService } from '../feezback.service';

@Injectable()
export class FeezbackWebhookService {
  private readonly logger = new Logger(FeezbackWebhookService.name);

  constructor(
    @InjectRepository(FeezbackWebhookEvent)
    private readonly webhookRepository: Repository<FeezbackWebhookEvent>,
    private readonly consentService: FeezbackConsentService,
    private readonly consentSyncService: ConsentSyncService,
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
        // Self-healing: not finding the row is normal on the very first
        // ConsentStatusChanged for a brand-new consent (the row is created
        // by syncUserConsents below). Demoted to debug to avoid log noise.
        this.logger.debug(`[FeezbackWebhook][ConsentStatusChanged] Consent row not yet persisted consentId=${consentId} tppId=${tppId}`);
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

    // If the consent moved to a terminal state (revoked / expired / rejected),
    // null out consentId on Source rows that pointed at it. The dialog will then
    // render "בצע חיבור מחדש" instead of "נסה שוב" — which fails with 403.
    const TERMINAL_STATUS_FRAGMENTS = ['REVOK', 'EXPIR', 'REJECT', 'TERMINAT', 'INVALID'];
    const isTerminal = currentStatus
      ? TERMINAL_STATUS_FRAGMENTS.some(frag => currentStatus.toUpperCase().includes(frag))
      : false;
    if (isTerminal) {
      try {
        const cleared = await this.feezbackService.clearConsentOnSources(firebaseId, consentId);
        if (cleared > 0) {
          this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] cleared consentId from ${cleared} source(s) — consentId=${consentId} status=${currentStatus} firebaseId=${masked}`);
        }
      } catch (error: any) {
        this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] clearConsentOnSources failed firebaseId=${masked}: ${error?.message}`, error?.stack);
      }

      // Also clear `lastConsentInitiatedAt` so the "unprocessed consent" guard
      // in triggerPostLoginSync stops matching. Without this, a user who
      // revokes all consents stays permanently locked out of login sync —
      // the timestamp would still be > fullFinishedAt forever.
      try {
        await this.feezbackService.clearConsentInitiated(firebaseId);
      } catch (error: any) {
        this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] clearConsentInitiated failed firebaseId=${masked}: ${error?.message}`, error?.stack);
      }
    }
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

    // UserDataIsAvailable is Feezback's signal that data is ready. The
    // post-consent endpoint (POST /transactions/post-consent-sync) does NOT
    // trigger sync itself — it only refreshes Source rows and reports a
    // 'pending' / 'completed' status to the frontend. So this webhook is the
    // SOLE sync trigger after a consent flow.
    //
    // Safety:
    //   - The atomic DB lock (markSyncRunning) prevents racing with a
    //     concurrent login sync (e.g. on a multi-replica deployment); if the
    //     lock is held, triggerFullSync skips cleanly.
    //   - Webhook controller ACKs immediately and runs this async — webhook
    //     latency to Feezback isn't affected.
    //   - All errors are swallowed so the controller still responds 200 and
    //     Feezback doesn't retry (we already persisted the event for audit).
    try {
      await this.feezbackService.refreshUserSources(firebaseId, 'UserDataIsAvailable');
      await this.feezbackService.triggerFullSync(firebaseId, 'webhook');
    } catch (error: any) {
      this.logger.error(
        `[FeezbackWebhook][UserDataIsAvailable] handler failed firebaseId=${masked}: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
