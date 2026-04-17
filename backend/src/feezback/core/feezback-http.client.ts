import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { FeezbackAuthService } from './feezback-auth.service';
import { FeezbackHttpError, toFeezbackHttpError } from './feezback-errors';
import {
  FEEZBACK_RETRY,
  calcBackoffMs,
  isRateLimitError,
  isRetryableFeezbackError,
  parseRetryAfterMs,
  sleep,
} from './feezback-retry.utils';

interface RequestOptions {
  sub?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

@Injectable()
export class FeezbackHttpClient {
  private readonly logger = new Logger(FeezbackHttpClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly authService: FeezbackAuthService,
  ) { }

  get baseUrl(): string {
    return this.authService.getTppApiUrl();
  }

  async get<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = any>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const { maxRetries } = FEEZBACK_RETRY;
    const { endpoint } = this.classifyUrl(url);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Rebuild auth headers on every attempt so a fresh token is used after long back-offs.
      const headers = await this.buildHeaders(options);
      const config: AxiosRequestConfig = {
        headers,
        params: options.params,
        timeout: options.timeout ?? 60_000,
      };

      try {
        const response: AxiosResponse<T> = await firstValueFrom(
          method === 'GET'
            ? this.http.get<T>(url, config)
            : this.http.post<T>(url, body, config),
        );

        return response.data;
      } catch (rawError) {
        const mapped = toFeezbackHttpError(method, url, rawError);

        if (mapped.responseBody !== undefined) {
          let dataStr: string;
          try { dataStr = JSON.stringify(mapped.responseBody); } catch { dataStr = String(mapped.responseBody); }
          this.logger.error(
            `[Feezback] Error response | endpoint=${endpoint} | status=${mapped.status ?? 'unknown'} | data=${dataStr}`,
          );
        }

        const rateLimit = isRateLimitError(mapped);
        const shouldRetry = isRetryableFeezbackError(mapped);

        if (!shouldRetry || attempt === maxRetries) {
          this.logger.error(
            `[Feezback] Failed | endpoint=${endpoint} | attempts=${attempt + 1} | status=${mapped.status ?? 'unknown'} | error=${mapped.message}`,
          );
          throw mapped;
        }

        const retryAfterMs = rateLimit ? parseRetryAfterMs(mapped.headers) : null;
        const waitMs = retryAfterMs ?? calcBackoffMs(attempt);
        const reason = rateLimit ? 'rate-limit (429)' : 'transient error';

        this.logger.warn(
          `[Feezback] Retry ${attempt + 1}/${maxRetries} | endpoint=${endpoint} | status=${mapped.status ?? 'unknown'} | reason=${reason} | waitMs=${waitMs}`,
        );

        await sleep(waitMs);
      }
    }

    // Unreachable — loop always returns or throws before here.
    throw new FeezbackHttpError({
      method,
      url,
      message: `Unexpected retry loop exit for ${method} ${url}`,
    });
  }

  private async buildHeaders(options: RequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.sub) {
      const authHeaders = await this.authService.getAuthHeaders(options.sub);
      Object.assign(headers, authHeaders);
    }

    return headers;
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const trimmedBase = this.baseUrl.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
  }

  /**
   * [DIAG] Extract a short endpoint label and resource identifier from a Feezback URL.
   */
  private classifyUrl(url: string): { endpoint: string; resource: string } {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/').filter(Boolean);

      // .../consents/{consentId}/cards/{cardResourceId}/transactions
      const cardsTxIdx = segments.indexOf('cards');
      const txIdx = segments.lastIndexOf('transactions');
      if (cardsTxIdx !== -1 && txIdx > cardsTxIdx) {
        return { endpoint: 'cardTransactions', resource: segments[cardsTxIdx + 1] ?? 'unknown' };
      }

      // .../accounts/{accountId}/transactions  (href-based bank transactions)
      const acctIdx = segments.indexOf('accounts');
      if (acctIdx !== -1 && txIdx > acctIdx) {
        return { endpoint: 'accountTransactions', resource: segments[acctIdx + 1] ?? 'unknown' };
      }

      // Direct transactions link (may not have /accounts/ prefix)
      if (txIdx !== -1) {
        return { endpoint: 'accountTransactions', resource: segments[txIdx - 1] ?? 'unknown' };
      }

      // .../accounts
      if (segments[segments.length - 1] === 'accounts') {
        return { endpoint: 'accounts', resource: '-' };
      }

      // .../cards
      if (segments[segments.length - 1] === 'cards') {
        return { endpoint: 'cards', resource: '-' };
      }

      // .../consents
      if (segments[segments.length - 1] === 'consents') {
        return { endpoint: 'consents', resource: '-' };
      }

      return { endpoint: segments[segments.length - 1] ?? 'unknown', resource: '-' };
    } catch {
      return { endpoint: 'unknown', resource: '-' };
    }
  }

  private logDebug(message: string, config: AxiosRequestConfig): void {
    this.logger.debug(`${message} headers=${JSON.stringify(config.headers)} params=${JSON.stringify(config.params)}`);
  }

  private logSuccess(method: string, url: string, status: number): void {
    this.logger.debug(`${method} ${url} -> status ${status}`);
  }

  private logFailure(error: FeezbackHttpError): void {
    this.logger.error(
      `${error.method} ${error.url} failed (status=${error.status ?? 'unknown'} code=${error.code ?? 'n/a'}): ${error.message}`,
    );
  }
}
