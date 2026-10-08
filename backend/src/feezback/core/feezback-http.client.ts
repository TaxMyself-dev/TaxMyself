import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FeezbackAuthService } from './feezback-auth.service';
import { FeezbackHttpError, toFeezbackHttpError } from './feezback-errors';
import { feeZbackErrorDiagnostic } from './feezback-error-diagnostic';
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

export interface FeezbackDebugHttpCall {
  sentAt: string;
  receivedAt?: string;
  durationMs?: number;
  status?: number;
  method: 'GET' | 'POST';
  url: string;
  attempt: number;
  maxAttempts: number;
  curl: string;
}

@Injectable()
export class FeezbackHttpClient {
  private readonly logger = new Logger(FeezbackHttpClient.name);
  private readonly debugTrace = new AsyncLocalStorage<FeezbackDebugHttpCall[]>();

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

  /** Capture the exact provider HTTP calls made by one async operation. */
  async withDebugTrace<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; httpCalls: FeezbackDebugHttpCall[] }> {
    const httpCalls: FeezbackDebugHttpCall[] = [];
    const result = await this.debugTrace.run(httpCalls, operation);
    return { result, httpCalls };
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

      const sentAt = Date.now();
      const traceEntry: FeezbackDebugHttpCall = {
        sentAt: new Date(sentAt).toISOString(),
        method,
        url,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        curl: this.buildRedactedCurl(method, url, headers, body),
      };
      this.debugTrace.getStore()?.push(traceEntry);

      try {
        const response: AxiosResponse<T> = await firstValueFrom(
          method === 'GET'
            ? this.http.get<T>(url, config)
            : this.http.post<T>(url, body, config),
        );

        const durationMs = Date.now() - sentAt;
        traceEntry.receivedAt = new Date(sentAt + durationMs).toISOString();
        traceEntry.durationMs = durationMs;
        traceEntry.status = response.status;

        return response.data;
      } catch (rawError) {
        const mapped = toFeezbackHttpError(method, url, rawError);
        const failedAt = Date.now();
        traceEntry.receivedAt = new Date(failedAt).toISOString();
        traceEntry.durationMs = failedAt - sentAt;
        traceEntry.status = mapped.status;

        const rateLimit = isRateLimitError(mapped);
        const shouldRetry = isRetryableFeezbackError(mapped);

        if (!shouldRetry || attempt === maxRetries) {
          if (method === 'POST' && /\/(link|token)\/?(?:\?|$)/.test(url)) {
            const token = (body as { token?: string } | undefined)?.token;
            this.logger.error(`[FeezbackResponse] ${feeZbackErrorDiagnostic(mapped, token ? [token] : [])}`);
          }
          throw mapped;
        }

        const retryAfterMs = rateLimit ? parseRetryAfterMs(mapped.headers) : null;
        const waitMs = retryAfterMs ?? calcBackoffMs(attempt);

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

  private buildRedactedCurl(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): string {
    const quote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
    const sensitiveHeader = /authorization|token|api[-_]?key|cookie/i;
    const parts = [`curl --request ${method}`, `--url ${quote(url)}`];

    for (const [name, value] of Object.entries(headers)) {
      const safeValue = sensitiveHeader.test(name) ? '<REDACTED>' : value;
      parts.push(`--header ${quote(`${name}: ${safeValue}`)}`);
    }

    if (method === 'POST' && body !== undefined) {
      parts.push(`--data ${quote(JSON.stringify(body))}`);
    }

    return parts.join(' \\\n  ');
  }

}
