import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { UserIntegration } from '../entities/user-integration.entity';
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationSyncStatus,
} from '../enums/integrations.enums';
import {
  decryptIntegrationToken,
  encryptIntegrationToken,
} from '../utils/integration-token-encryption.util';

export interface UpsertIntegrationInput {
  firebaseId: string;
  provider: IntegrationProvider;
  /** Plaintext refresh token — encrypted here before persisting. */
  refreshToken: string;
  /** Plaintext access token — encrypted here before persisting. */
  accessToken?: string | null;
  accountId?: string | null;
  accountEmail?: string | null;
  scopes?: string | null;
  expiresAt?: Date | null;
}

/**
 * Persistence layer for user_integrations — connections between a KeepInTax
 * user and an external provider account (Google, Microsoft, ...).
 *
 * Provider-agnostic by design: OAuth flows (Phase B) and provider APIs
 * (Gmail, Drive import — later phases) build on top of this service.
 * Tokens are encrypted/decrypted only at this boundary; callers never see
 * or pass ciphertext.
 */
@Injectable()
export class UserIntegrationsService {
  private readonly logger = new Logger(UserIntegrationsService.name);

  constructor(
    @InjectRepository(UserIntegration)
    private readonly userIntegrationRepo: Repository<UserIntegration>,
  ) {}

  /** All integrations of a user, for a future "connected accounts" screen. */
  async findAllForUser(firebaseId: string): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId },
      order: { provider: 'ASC' },
    });
  }

  async findByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration | null> {
    return this.userIntegrationRepo.findOne({ where: { firebaseId, provider } });
  }

  /** The user's integration for a provider, only if it is currently ACTIVE. */
  async findActiveIntegration(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration | null> {
    return this.userIntegrationRepo.findOne({
      where: { firebaseId, provider, status: IntegrationStatus.ACTIVE },
    });
  }

  /**
   * Creates the user's integration for a provider, or overwrites the existing
   * one (re-connect / re-consent). Always resets status to ACTIVE.
   * Tokens are encrypted before persisting.
   */
  async upsertIntegration(input: UpsertIntegrationInput): Promise<UserIntegration> {
    const existing = await this.findByUserAndProvider(input.firebaseId, input.provider);

    const integration = existing ?? this.userIntegrationRepo.create({
      firebaseId: input.firebaseId,
      provider: input.provider,
    });

    // Reconnecting a DIFFERENT provider account means a different mailbox —
    // the previous sync cursor and initial-import state belong to the old
    // account and must not gate or seed syncs of the new one.
    if (
      existing?.accountId &&
      input.accountId &&
      existing.accountId !== input.accountId
    ) {
      this.logger.warn(
        `${input.provider} account changed for firebaseId=${input.firebaseId} ` +
          `(integration ${existing.id}) — resetting sync state`,
      );
      this.clearSyncStateFields(integration);
    }

    integration.refreshToken = encryptIntegrationToken(input.refreshToken);
    integration.accessToken = input.accessToken
      ? encryptIntegrationToken(input.accessToken)
      : null;
    integration.accountId = input.accountId ?? null;
    integration.accountEmail = input.accountEmail ?? null;
    integration.scopes = input.scopes ?? null;
    integration.expiresAt = input.expiresAt ?? null;
    integration.status = IntegrationStatus.ACTIVE;

    const saved = await this.userIntegrationRepo.save(integration);
    this.logger.log(
      `${existing ? 'Updated' : 'Created'} ${input.provider} integration for firebaseId=${input.firebaseId}`,
    );
    return saved;
  }

  /**
   * Updates the cached access token (and optionally a rotated refresh token)
   * after a token refresh. Tokens are encrypted before persisting.
   */
  async updateTokens(
    integrationId: number,
    tokens: { accessToken?: string | null; refreshToken?: string; expiresAt?: Date | null },
  ): Promise<void> {
    const update: Partial<UserIntegration> = {};
    if (tokens.accessToken !== undefined) {
      update.accessToken = tokens.accessToken
        ? encryptIntegrationToken(tokens.accessToken)
        : null;
    }
    if (tokens.refreshToken !== undefined) {
      update.refreshToken = encryptIntegrationToken(tokens.refreshToken);
    }
    if (tokens.expiresAt !== undefined) {
      update.expiresAt = tokens.expiresAt;
    }
    await this.userIntegrationRepo.update({ id: integrationId }, update);
  }

  /** Decrypted refresh token. Use immediately before a provider call; never log it. */
  getDecryptedRefreshToken(integration: UserIntegration): string {
    if (!integration.refreshToken) {
      throw new Error(
        `Integration ${integration.id} has no stored refresh token (status=${integration.status})`,
      );
    }
    return decryptIntegrationToken(integration.refreshToken);
  }

  /** Decrypted cached access token, or null if none is stored. Never log it. */
  getDecryptedAccessToken(integration: UserIntegration): string | null {
    return integration.accessToken
      ? decryptIntegrationToken(integration.accessToken)
      : null;
  }

  /**
   * Marks the integration REVOKED (user disconnect) or EXPIRED (invalid_grant).
   * The row is kept for audit/history; a re-connect goes through upsertIntegration.
   */
  async updateStatus(integrationId: number, status: IntegrationStatus): Promise<void> {
    await this.userIntegrationRepo.update({ id: integrationId }, { status });
  }

  /**
   * Integrations eligible for the nightly Gmail sync: ACTIVE Google
   * connections whose initial manual import completed. RUNNING rows are NOT
   * excluded here — the sync itself decides whether a RUNNING marker is live
   * (skip) or stale from a crashed run (recover), so that logic stays in one
   * place (GmailSyncService).
   */
  async findGmailSyncCandidates(): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: {
        provider: IntegrationProvider.GOOGLE,
        status: IntegrationStatus.ACTIVE,
        initialImportCompletedAt: Not(IsNull()),
      },
      order: { id: 'ASC' },
    });
  }

  // --- Gmail sync state transitions ------------------------------------------
  // The three legal moves are RUNNING → SUCCESS and RUNNING → ERROR (plus the
  // reset on account change in upsertIntegration). Callers own the decision of
  // WHEN a run counts as successful; this service only persists the outcome.

  /** A sync run (initial import or nightly) is starting now. */
  async markSyncRunning(integrationId: number): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        lastSyncStatus: IntegrationSyncStatus.RUNNING,
        lastSyncStartedAt: new Date(),
        lastSyncError: null,
      },
    );
  }

  /**
   * A sync run finished successfully — advance the cursor. When the run was
   * the initial manual import, also record its completion and chosen range
   * (dates as 'YYYY-MM-DD').
   */
  async markSyncSuccess(
    integrationId: number,
    options: {
      lastSuccessfulSyncAt: Date;
      initialImport?: { fromDate: string; toDate: string };
    },
  ): Promise<void> {
    const update: Partial<UserIntegration> = {
      lastSyncStatus: IntegrationSyncStatus.SUCCESS,
      lastSyncError: null,
      lastSuccessfulSyncAt: options.lastSuccessfulSyncAt,
    };
    if (options.initialImport) {
      update.initialImportCompletedAt = new Date();
      update.initialImportFromDate = options.initialImport.fromDate;
      update.initialImportToDate = options.initialImport.toDate;
    }
    await this.userIntegrationRepo.update({ id: integrationId }, update);
  }

  /** A sync run failed — record why. The cursor is deliberately NOT advanced. */
  async markSyncError(integrationId: number, error: string): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        lastSyncStatus: IntegrationSyncStatus.ERROR,
        // TEXT column, but keep pathological messages bounded anyway.
        lastSyncError: error.length > 2000 ? error.slice(0, 2000) : error,
      },
    );
  }

  /** Blanks every Gmail sync field on the (unsaved) entity. */
  private clearSyncStateFields(integration: UserIntegration): void {
    integration.initialImportCompletedAt = null;
    integration.initialImportFromDate = null;
    integration.initialImportToDate = null;
    integration.lastSyncStartedAt = null;
    integration.lastSuccessfulSyncAt = null;
    integration.lastSyncStatus = null;
    integration.lastSyncError = null;
  }

  /**
   * User-initiated disconnect: clears the stored tokens and marks the
   * integration REVOKED. The row is kept for audit/history.
   */
  async disconnect(integrationId: number): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        refreshToken: null,
        accessToken: null,
        expiresAt: null,
        status: IntegrationStatus.REVOKED,
      },
    );
    this.logger.log(`Integration ${integrationId} disconnected (tokens cleared, status REVOKED)`);
  }
}
