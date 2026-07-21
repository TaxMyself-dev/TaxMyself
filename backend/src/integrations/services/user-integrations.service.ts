import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { GmailImportSummary } from '../dto/gmail-import-summary';
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
  /**
   * Provider-side account identifier (Google `sub`). REQUIRED: it is the
   * global identity of the connected account and half of the upsert key
   * UNIQUE(provider, accountId).
   */
  accountId: string;
  /** Plaintext refresh token — encrypted here before persisting. */
  refreshToken: string;
  /** Plaintext access token — encrypted here before persisting. */
  accessToken?: string | null;
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

  /** All integrations of a user, for the "connected accounts" screen. */
  async findAllForUser(firebaseId: string): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId },
      order: { provider: 'ASC', id: 'ASC' },
    });
  }

  /** All of a user's integrations for one provider (any status), oldest first. */
  async findAllByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId, provider },
      order: { id: 'ASC' },
    });
  }

  /**
   * A user's integrations for one provider that should be VISIBLE in the UI —
   * everything except REVOKED. A REVOKED row is a mailbox the user
   * intentionally disconnected: it must vanish from the settings screen and
   * from the frontend status endpoints. EXPIRED rows stay visible so the user
   * can see the failure and reconnect.
   */
  async findAllVisibleByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId, provider, status: Not(IntegrationStatus.REVOKED) },
      order: { id: 'ASC' },
    });
  }

  /** A user's ACTIVE integrations for one provider, oldest first. */
  async findAllActiveByUserAndProvider(
    firebaseId: string,
    provider: IntegrationProvider,
  ): Promise<UserIntegration[]> {
    return this.userIntegrationRepo.find({
      where: { firebaseId, provider, status: IntegrationStatus.ACTIVE },
      order: { id: 'ASC' },
    });
  }

  /** The single integration for a provider account, keyed on the upsert key. */
  async findByProviderAndAccountId(
    provider: IntegrationProvider,
    accountId: string,
  ): Promise<UserIntegration | null> {
    return this.userIntegrationRepo.findOne({ where: { provider, accountId } });
  }

  /**
   * Loads an integration by id and asserts it belongs to firebaseId. Throws
   * 404 both when the row is missing and when it is owned by another user —
   * a foreign id must not leak that the integration exists.
   */
  async findOwnedByIdOrThrow(
    integrationId: number,
    firebaseId: string,
  ): Promise<UserIntegration> {
    const integration = await this.userIntegrationRepo.findOne({
      where: { id: integrationId },
    });
    if (!integration || integration.firebaseId !== firebaseId) {
      throw new NotFoundException('Integration not found');
    }
    return integration;
  }

  /**
   * Connects (or reconnects) a provider account, keyed on UNIQUE(provider,
   * accountId) so a single user can hold many accounts of the same provider.
   *
   * - No existing row → create a new integration for this user (ACTIVE).
   * - Existing row owned by the SAME user → refresh tokens/scopes/expiry and
   *   set ACTIVE; sync state (cursor, initial-import) is PRESERVED, because it
   *   belongs to this same mailbox.
   * - Existing row owned by ANOTHER user → reject: a Gmail account belongs to
   *   exactly one KeepInTax user globally.
   *
   * Tokens are encrypted before persisting.
   */
  async upsertIntegration(input: UpsertIntegrationInput): Promise<UserIntegration> {
    if (!input.accountId) {
      throw new ConflictException(
        `Cannot connect ${input.provider}: the provider returned no account id.`,
      );
    }

    const existing = await this.findByProviderAndAccountId(input.provider, input.accountId);

    if (existing && existing.firebaseId !== input.firebaseId) {
      this.logger.warn(
        `Rejected ${input.provider} connect: account ${input.accountId} is already ` +
          `linked to another KeepInTax user (integration ${existing.id})`,
      );
      throw new ConflictException(
        'This account is already connected to a different KeepInTax user.',
      );
    }

    const integration =
      existing ??
      this.userIntegrationRepo.create({
        firebaseId: input.firebaseId,
        provider: input.provider,
      });

    integration.accountId = input.accountId;
    integration.refreshToken = encryptIntegrationToken(input.refreshToken);
    integration.accessToken = input.accessToken
      ? encryptIntegrationToken(input.accessToken)
      : null;
    integration.accountEmail = input.accountEmail ?? null;
    integration.scopes = input.scopes ?? null;
    integration.expiresAt = input.expiresAt ?? null;
    integration.status = IntegrationStatus.ACTIVE;

    const saved = await this.userIntegrationRepo.save(integration);
    this.logger.log(
      `${existing ? 'Updated' : 'Created'} ${input.provider} integration ` +
        `${saved.id} for firebaseId=${input.firebaseId}`,
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
      /**
       * User-facing outcome to publish for this run, or null to clear a
       * previous one. Omit to leave the stored summary untouched.
       */
      importSummary?: GmailImportSummary | null;
    },
  ): Promise<void> {
    const update: Partial<UserIntegration> = {
      lastSyncStatus: IntegrationSyncStatus.SUCCESS,
      lastSyncError: null,
      lastSuccessfulSyncAt: options.lastSuccessfulSyncAt,
    };
    if (options.importSummary !== undefined) {
      update.lastImportSummary = options.importSummary;
    }
    if (options.initialImport) {
      update.initialImportCompletedAt = new Date();
      update.initialImportFromDate = options.initialImport.fromDate;
      update.initialImportToDate = options.initialImport.toDate;
    }
    await this.userIntegrationRepo.update({ id: integrationId }, update);
  }

  /**
   * A sync run failed — record why. The cursor is deliberately NOT advanced.
   * `importSummary` carries the user-facing outcome when the run produced one
   * before failing (so the UI can still show what was imported); the technical
   * `error` text stays server-side.
   */
  async markSyncError(
    integrationId: number,
    error: string,
    importSummary: GmailImportSummary | null = null,
  ): Promise<void> {
    await this.userIntegrationRepo.update(
      { id: integrationId },
      {
        lastSyncStatus: IntegrationSyncStatus.ERROR,
        // TEXT column, but keep pathological messages bounded anyway.
        lastSyncError: error.length > 2000 ? error.slice(0, 2000) : error,
        lastImportSummary: importSummary,
      },
    );
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
