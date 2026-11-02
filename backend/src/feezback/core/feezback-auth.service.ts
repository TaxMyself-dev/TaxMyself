import { isPublicKeyLookupFailure, PUBLIC_KEY_LOOKUP_RETRY_DELAY_MS } from './feezback-key-lookup-retry';
import { sleep } from './feezback-retry.utils';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { FeezbackJwtService } from '../feezback-jwt.service';
import { toFeezbackHttpError } from './feezback-errors';
import { feeZbackErrorDiagnostic } from './feezback-error-diagnostic';

// Feezback confirmed access tokens are valid for at most ten minutes.
const MAX_ACCESS_TOKEN_LIFETIME_SECONDS = 600;

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class FeezbackAuthService {
  private readonly logger = new Logger(FeezbackAuthService.name);
  private readonly tokenUrl: string;
  private readonly lgsUrl: string;
  private readonly tppApiUrl: string;
  private readonly tppId: string;
  private readonly cacheSkewMs = 60_000; // refresh 60s before expiration
  private readonly tokenCache = new Map<string, TokenCacheEntry>();

  constructor(
    private readonly http: HttpService,
    private readonly feezbackJwtService: FeezbackJwtService,
  ) {
    const defaultBaseUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback';

    this.tppId = 'KNCAXnwXk1';
    this.tppApiUrl = defaultBaseUrl;
    this.tokenUrl = `${defaultBaseUrl}/token`;
    this.lgsUrl = `${defaultBaseUrl}/link`;
  }

  getTppId(): string {
    return this.tppId;
  }

  getTppApiUrl(): string {
    return this.tppApiUrl;
  }

  getLgsUrl(): string {
    return this.lgsUrl;
  }

  getTokenUrl(): string {
    return this.tokenUrl;
  }

  async getAccessToken(sub: string): Promise<string> {
    const cached = this.tokenCache.get(sub);
    const now = Date.now();

    if (cached && cached.expiresAt - this.cacheSkewMs > now) {
      return cached.token;
    }

    const freshToken = await this.requestNewAccessToken(sub);
    return freshToken;
  }

  async getAuthHeaders(sub: string): Promise<Record<string, string>> {
    const token = await this.getAccessToken(sub);
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  clearCache(sub?: string): void {
    if (sub) {
      this.tokenCache.delete(sub);
      return;
    }

    this.tokenCache.clear();
  }

  private async requestNewAccessToken(sub: string): Promise<string> {
    let jwtToken = '';
    try {
      jwtToken = this.feezbackJwtService.generateAccessToken(sub);

      // Sign once and reuse exactly the same request body for the one bounded
      // retry. A new JWT would hide whether the provider key lookup recovered.
      const body = { token: jwtToken };
      let response: AxiosResponse<{ token?: string; expiresIn?: number; expires_in?: number }>;
      let requestedAt = Date.now();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          requestedAt = Date.now();
          response = await firstValueFrom(this.http.post(this.tokenUrl, body));
          break;
        } catch (error) {
          const mapped = toFeezbackHttpError('POST', this.tokenUrl, error);
          if (attempt !== 0 || !isPublicKeyLookupFailure(mapped)) throw mapped;
          await sleep(PUBLIC_KEY_LOOKUP_RETRY_DELAY_MS);
        }
      }

      const accessToken = response.data?.token;
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Invalid Feezback access token response');
      }

      const expiresInSeconds = this.extractExpiresIn(response.data);
      // Count from the request start so network latency cannot extend validity.
      const expiresAt = requestedAt + expiresInSeconds * 1000;
      this.tokenCache.set(sub, { token: accessToken, expiresAt });

      return accessToken;
    } catch (error) {
      const mapped = toFeezbackHttpError('POST', this.tokenUrl, error);
      this.logger.error(`[FeezbackResponse] ${feeZbackErrorDiagnostic(mapped, [jwtToken, sub])}`);
      throw mapped;
    }
  }

  private extractExpiresIn(payload: { expiresIn?: number; expires_in?: number } | undefined): number {
    const reportedLifetimes = [payload?.expiresIn, payload?.expires_in]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    // Respect a shorter provider lifetime, but never cache beyond ten minutes,
    // even when expiry metadata is missing, invalid, or unexpectedly longer.
    return Math.min(MAX_ACCESS_TOKEN_LIFETIME_SECONDS, ...reportedLifetimes);
  }

  private describeError(error: unknown): string {
    if (!error) {
      return 'unknown error';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return JSON.stringify(error);
  }
}
