import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BankingBatchError, bankingIssue } from '../core/open-banking-issue';
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

    let eventEntity = this.webhookRepository.create({
      eventType,
      payloadJson: body,
      payloadHash,
      processedAt: null,
      processingError: null,
      processingStartedAt: new Date(),
    });

    try {
      await this.webhookRepository.save(eventEntity);
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.code === '23505') {
        const existing = await this.webhookRepository.findOne({ where: { payloadHash } });
        if (!existing || existing.processedAt || (!existing.processingError && existing.processingStartedAt &&
          Date.now() - new Date(existing.processingStartedAt).getTime() < 10 * 60_000)) return;
        const lease = new Date();
        const acquired = await this.webhookRepository.update({ id: existing.id, processedAt: IsNull(),
          processingError: existing.processingError ?? IsNull(), processingStartedAt: existing.processingStartedAt ?? IsNull() },
          { processingStartedAt: lease, processingError: null });
        if (!acquired.affected) return;
        eventEntity = Object.assign(existing, { processingStartedAt: lease });
      } else {
        throw error;
      }
    }

    try {
      await this.processEvent(eventEntity, body);
      await this.webhookRepository.update({ id: eventEntity.id, processingStartedAt: eventEntity.processingStartedAt },
        { processedAt: new Date(), processingError: null });
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook] Error processing event=${eventType}: ${error?.message}`, error?.stack);
      const userId = parseFeezbackUserIdentifier(body?.payload?.user, body?.payload?.tpp).firebaseId ?? 'unknown';
      const issue = error instanceof BankingBatchError ? error.issues[0]
        : bankingIssue(this.logger, 'connection_save', userId, 'webhook_processing_failed', error);
      await this.webhookRepository.update({ id: eventEntity.id, processingStartedAt: eventEntity.processingStartedAt }, {
        processedAt: null,
        processingError: `${issue.code}|${issue.errorId}`,
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
      throw new BadRequestException('Missing webhook payload');
    }

    const consentId = typeof payload.consent === 'string' ? payload.consent : null;
    if (!consentId) {
      this.logger.warn('[FeezbackWebhook][ConsentStatusChanged] Missing consent identifier in payload');
      throw new BadRequestException('Missing webhook consent');
    }

    const currentStatus = typeof payload.currentStatus === 'string' ? payload.currentStatus : null;
    this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] consentId=${consentId} currentStatus=${currentStatus ?? 'none'}`);

    const TERMINAL_STATUS_FRAGMENTS = ['REVOK', 'EXPIR', 'REJECT', 'TERMINAT', 'INVALID', 'SUSPEND', 'NOANSWER'];
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
      throw new BadRequestException('Missing webhook user');
    }

    const masked = firebaseId.length >= 8 ? firebaseId.substring(0, 8) + '...' : firebaseId;

    try {
      const cleared = await this.feezbackService.clearConsentOnSources(firebaseId, consentId, userIdentifier?.split('@')[0].endsWith('_sub_spouse'));
      // Re-read all current consents; one revoked bank must not disconnect another valid bank.
      await this.feezbackService.refreshUserSources(firebaseId, 'ConsentStatusChanged');
      if (cleared > 0) {
        this.logger.log(`[FeezbackWebhook][ConsentStatusChanged] cleared consentId from ${cleared} source(s) — consentId=${consentId} status=${currentStatus} firebaseId=${masked}`);
      }
    } catch (error: any) {
      this.logger.error(`[FeezbackWebhook][ConsentStatusChanged] clearConsentOnSources failed firebaseId=${masked}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private async handleUserDataIsAvailable(body: FeezbackWebhookEventBody): Promise<void> {
    const payload = body?.payload as Record<string, any> | undefined;
    if (!payload) {
      this.logger.warn('[FeezbackWebhook][UserDataIsAvailable] Missing payload data');
      throw new BadRequestException('Missing webhook payload');
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
      throw new BadRequestException('Missing webhook identifiers');
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
    //   - Receipt is acknowledged independently. Errors reach the persisted
    //     processing result, leaving failed events eligible for a later replay.
    try {
      if (sub.endsWith('_sub_spouse')) {
        const verified = await this.feezbackService.verifySpouseWebhookConnection(firebaseId, sub);
        if (!verified) return;
      }
      await this.feezbackService.refreshUserSources(firebaseId, 'UserDataIsAvailable');
    } catch (error: any) {
      this.logger.error(
        `[FeezbackWebhook][UserDataIsAvailable] handler failed firebaseId=${masked}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
