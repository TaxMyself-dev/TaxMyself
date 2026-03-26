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
    const { endpoint, resource } = this.classifyUrl(url);
    const requestStartMs = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Rebuild auth headers on every attempt so a fresh token is used after long back-offs.
      const headers = await this.buildHeaders(options);
      const config: AxiosRequestConfig = {
        headers,
        params: options.params,
        timeout: options.timeout ?? 60_000,
      };

      const attemptStartMs = Date.now();
      this.logger.log(
        `[DIAG] FB_REQUEST_START | endpoint=${endpoint} | resource=${resource} | attempt=${attempt + 1}/${maxRetries + 1} | elapsed=${attemptStartMs - requestStartMs}ms`,
      );

      try {
        this.logDebug(`${method} ${url}`, config);

        const response: AxiosResponse<T> = await firstValueFrom(
          method === 'GET'
            ? this.http.get<T>(url, config)
            : this.http.post<T>(url, body, config),
        );

        const durationMs = Date.now() - attemptStartMs;
        this.logger.log(
          `[DIAG] FB_SUCCESS | endpoint=${endpoint} | resource=${resource} | attempt=${attempt + 1}/${maxRetries + 1} | durationMs=${durationMs} | elapsed=${Date.now() - requestStartMs}ms`,
        );

        this.logSuccess(method, url, response.status);
        return response.data;
      } catch (rawError) {
        const mapped = toFeezbackHttpError(method, url, rawError);

        if (mapped.status === 403) {
          this.logger.error('[FB_403]', {
            method,
            url,
            status: mapped.status,
            body: mapped.responseBody,
          });
        }

        if (mapped.status === 401) {
          this.logger.error('[FB_401]', {
            method,
            url,
            status: mapped.status,
            body: mapped.responseBody,
          });
        }

        const rateLimit = isRateLimitError(mapped);
        const shouldRetry = isRetryableFeezbackError(mapped);

        // Non-retryable error, or all attempts exhausted → throw.
        if (!shouldRetry || attempt === maxRetries) {
          this.logger.warn(
            `[DIAG] FB_FAILED | endpoint=${endpoint} | resource=${resource} | attempts=${attempt + 1} | lastStatus=${mapped.status ?? 'unknown'} | code=${mapped.code ?? 'n/a'} | elapsed=${Date.now() - requestStartMs}ms`,
          );

          if (shouldRetry && attempt === maxRetries) {
            this.logger.error(
              `${method} ${url} — all ${maxRetries + 1} attempts exhausted ` +
              `(status=${mapped.status ?? 'unknown'}, code=${mapped.code ?? 'n/a'}): ${mapped.message}`,
            );
          } else {
            this.logFailure(mapped);
          }
          throw mapped;
        }

        // Choose delay: honour Retry-After header when present (429 only), else back-off.
        const retryAfterMs = rateLimit ? parseRetryAfterMs(mapped.headers) : null;
        const waitMs = retryAfterMs ?? calcBackoffMs(attempt);
        const reason = rateLimit ? 'rate-limit (429)' : 'transient network error';
        const delaySource = retryAfterMs !== null ? 'Retry-After header' : 'exponential backoff';

        this.logger.warn(
          `[DIAG] FB_RETRY | endpoint=${endpoint} | resource=${resource} | attempt=${attempt + 1}/${maxRetries + 1} | status=${mapped.status ?? 'unknown'} | reason=${reason} | waitMs=${waitMs} | delaySource=${delaySource} | elapsed=${Date.now() - requestStartMs}ms`,
        );

        this.logger.warn(
          `[retry ${attempt + 1}/${maxRetries}] ${method} ${url} — ${reason}, ` +
          `waiting ${waitMs} ms (${delaySource})`,
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
