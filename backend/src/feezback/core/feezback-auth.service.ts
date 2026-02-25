import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { FeezbackJwtService } from '../feezback-jwt.service';
import { toFeezbackHttpError } from './feezback-errors';

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
    try {
      const jwtToken = this.feezbackJwtService.generateAccessToken(sub);

      const response: AxiosResponse<{ token?: string; expiresIn?: number; expires_in?: number }> =
        await firstValueFrom(
          this.http.post(this.tokenUrl, { token: jwtToken }),
        );

      const accessToken = response.data?.token;
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Invalid Feezback access token response');
      }

      const expiresInSeconds = this.extractExpiresIn(response.data);
      const expiresAt = Date.now() + expiresInSeconds * 1000;
      this.tokenCache.set(sub, { token: accessToken, expiresAt });

      this.logger.debug(`Fetched new Feezback access token for sub=${sub}`);
      return accessToken;
    } catch (error) {
      this.logger.error(`Failed to fetch Feezback access token for sub=${sub}: ${this.describeError(error)}`);
      throw toFeezbackHttpError('POST', this.tokenUrl, error);
    }
  }

  private extractExpiresIn(payload: { expiresIn?: number; expires_in?: number } | undefined): number {
    const fallback = 3600; // 1 hour default
    if (!payload) {
      return fallback;
    }

    if (typeof payload.expiresIn === 'number' && payload.expiresIn > 0) {
      return payload.expiresIn;
    }

    if (typeof payload.expires_in === 'number' && payload.expires_in > 0) {
      return payload.expires_in;
    }

    return fallback;
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
