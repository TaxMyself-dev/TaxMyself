import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackWebhookEvent } from './entities/feezback-webhook-event.entity';
import { FeezbackWebhookEventBody } from './dto/feezback-webhook.dto';
import { computeFeezbackEventHash } from '../utils/feezback-event.utils';
import { extractFirebaseIdFromContext, parseFeezbackUserIdentifier } from '../utils/feezback-user.utils';
import { FeezbackService } from '../feezback.service';

@Injectable()
export class FeezbackWebhookService {
  private readonly logger = new Logger(FeezbackWebhookService.name);

  constructor(
    @InjectRepository(FeezbackWebhookEvent)
    private readonly webhookRepository: Repository<FeezbackWebhookEvent>,
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

  /**
   * Handles `ConsentStatusChanged` webhooks. We don't persist consent metadata
   * anymore (the `feezback_consents` table is gone), so the only behaviour
   * that matters is terminal-state cleanup: when a consent transitions to
   * REVOKED / EXPIRED / REJECTED / TERMINATED / INVALID, null out the
   * consentId on matching `user_source_sync_state` rows and clear
   * `lastConsentInitiatedAt` so the user isn't permanently locked out of
   * login sync.
   */
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

    const TERMINAL_STATUS_FRAGMENTS = ['REVOK', 'EXPIR', 'REJECT', 'TERMINAT', 'INVALID'];
    const isTerminal = !!currentStatus &&
      TERMINAL_STATUS_FRAGMENTS.some(frag => currentStatus.toUpperCase().includes(frag));
    if (!isTerminal) {
      console.log(`[FeezbackWebhook][ConsentStatusChanged] consent received — waiting for UserDataIsAvailable webhook to fire the sync | consentId=${consentId} currentStatus=${currentStatus}`);
      return;
    }

    const userIdentifier = typeof payload.user === 'string' ? payload.user : null;
    const parsedUser = parseFeezbackUserIdentifier(userIdentifier, payload?.tpp || null);
    let firebaseId = parsedUser.firebaseId;
    if (!firebaseId && typeof payload.context === 'string') {
      firebaseId = extractFirebaseIdFromContext(payload.context);
    }
    if (!firebaseId) {
      this.logger.warn('[FeezbackWebhook][ConsentStatusChanged] Missing firebaseId — aborting terminal cleanup.');
      return;
    }

    const masked = firebaseId.length >= 8 ? firebaseId.substring(0, 8) + '...' : firebaseId;

    try {
      const cleared = await this.feezbackService.clearConsentOnSources(firebaseId, consentId);
      if (cleared > 0) {
        this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] cleared consentId from ${cleared} source(s) — consentId=${consentId} status=${currentStatus} firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] clearConsentOnSources failed firebaseId=${masked}: ${error?.message}`, error?.stack);
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

    // UserDataIsAvailable is Feezback's signal that data is ready. We only
    // refresh Source rows here (discover accounts/cards + grant OPEN_BANKING /
    // hasOpenBanking) so the UI shows the user as connected. We deliberately do
    // NOT trigger a transaction sync from the webhook: the post-consent dialog
    // shows the user a "למשיכת התנועות לחץ כאן" button, and the actual pull is
    // user-initiated via POST /transactions/trigger-sync. This avoids pulling a
    // year of transactions before the user has asked for them.
    //
    // Safety:
    //   - Webhook controller ACKs immediately and runs this async — webhook
    //     latency to Feezback isn't affected.
    //   - All errors are swallowed so the controller still responds 200 and
    //     Feezback doesn't retry (we already persisted the event for audit).
    try {
      await this.feezbackService.refreshUserSources(firebaseId, 'UserDataIsAvailable');
    } catch (error: any) {
      this.logger.error(
        `[FeezbackWebhook][UserDataIsAvailable] handler failed firebaseId=${masked}: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
