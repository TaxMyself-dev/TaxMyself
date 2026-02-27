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

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Rebuild auth headers on every attempt so a fresh token is used after long back-offs.
      const headers = await this.buildHeaders(options);
      const config: AxiosRequestConfig = {
        headers,
        params: options.params,
        timeout: options.timeout ?? 60_000,
      };

      try {
        this.logDebug(`${method} ${url}`, config);

        const response: AxiosResponse<T> = await firstValueFrom(
          method === 'GET'
            ? this.http.get<T>(url, config)
            : this.http.post<T>(url, body, config),
        );

        this.logSuccess(method, url, response.status);
        return response.data;
      } catch (rawError) {
        const mapped = toFeezbackHttpError(method, url, rawError);
        const rateLimit = isRateLimitError(mapped);
        const shouldRetry = isRetryableFeezbackError(mapped);

        // Non-retryable error, or all attempts exhausted → throw.
        if (!shouldRetry || attempt === maxRetries) {
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
