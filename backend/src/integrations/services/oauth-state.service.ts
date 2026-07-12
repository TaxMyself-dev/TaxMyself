import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { OauthState } from '../entities/oauth-state.entity';
import { IntegrationProvider } from '../enums/integrations.enums';

/** OAuth state rows expire after 10 minutes (same TTL as the SHAAM flow). */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Database-backed CSRF state for OAuth connect flows, provider-agnostic.
 * Replaces the earlier in-memory Map so state survives restarts and works
 * across multiple backend instances. Multiple parallel connect attempts per
 * user are supported — one row per attempt.
 */
@Injectable()
export class OauthStateService {
  private readonly logger = new Logger(OauthStateService.name);

  constructor(
    @InjectRepository(OauthState)
    private readonly oauthStateRepo: Repository<OauthState>,
  ) {}

  /**
   * Creates a new single-use state row for a connect attempt and returns the
   * state value. Expired rows are purged first (cheap, keeps the table tiny
   * without needing a cron).
   */
  async createState(
    firebaseId: string,
    provider: IntegrationProvider,
    redirectAfterSuccess: string | null = null,
  ): Promise<string> {
    await this.deleteExpired();

    const state = crypto.randomBytes(32).toString('hex');
    await this.oauthStateRepo.insert({
      state,
      firebaseId,
      provider,
      redirectAfterSuccess,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return state;
  }

  /**
   * Validates and consumes a callback state. The row is deleted before the
   * expiry check, and the DELETE's affected-row count guards against two
   * parallel callbacks consuming the same state — exactly one caller wins.
   * Throws BadRequestException when the state is unknown, already used,
   * or expired.
   */
  async consumeState(state: string, provider: IntegrationProvider): Promise<OauthState> {
    if (!state) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const row = await this.oauthStateRepo.findOne({ where: { state, provider } });
    if (!row) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const deleted = await this.oauthStateRepo.delete({ id: row.id });
    if (!deleted.affected) {
      // A parallel callback consumed this state between our find and delete.
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    return row;
  }

  private async deleteExpired(): Promise<void> {
    try {
      await this.oauthStateRepo.delete({ expiresAt: LessThan(new Date()) });
    } catch (error) {
      // Cleanup failure must not block a connect attempt; rows expire anyway.
      this.logger.warn(`Expired oauth_states cleanup failed: ${(error as Error)?.message ?? error}`);
    }
  }
}
