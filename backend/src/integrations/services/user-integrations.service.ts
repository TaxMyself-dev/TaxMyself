import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
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
}
