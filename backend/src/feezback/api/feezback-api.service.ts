import { FeezbackHttpError } from '../core/feezback-errors';
import { Injectable, Logger } from '@nestjs/common';
import { FeezbackHttpClient } from '../core/feezback-http.client';
import type { FeezbackDebugHttpCall } from '../core/feezback-http.client';
import { FeezbackAuthService } from '../core/feezback-auth.service';
import { FeezbackJwtService } from '../feezback-jwt.service';

@Injectable()
export class FeezbackApiService {
  private readonly logger = new Logger(FeezbackApiService.name);

  constructor(
    private readonly httpClient: FeezbackHttpClient,
    private readonly authService: FeezbackAuthService,
    private readonly feezbackJwtService: FeezbackJwtService,
  ) { }

  async createConsentLink(firebaseId: string, spouse = false): Promise<any> {
    const token = await this.feezbackJwtService.generateConsentJwt(firebaseId, spouse);
    // this.logger.debug(`Requesting consent link for firebaseId=${firebaseId}`);
    return this.httpClient.post(this.authService.getLgsUrl(), { token });
  }

  withDebugTrace<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; httpCalls: FeezbackDebugHttpCall[] }> {
    return this.httpClient.withDebugTrace(operation);
  }

  async getUserConsents(sub: string, withInvalid = false): Promise<{ consents: any[] }> {
    // this.logger.log(`Fetching user consents for sub=${sub}`);
    let data: any;
    try {
      data = await this.getFromUserPath(sub, '/consents', withInvalid ? { withInvalid: 'true' } : undefined);
    } catch (error) {
      // Only this exact provider GET documents 404 as userNotFound. Token
      // endpoint/configuration 404s must remain uncertain, never prove revocation.
      if (withInvalid && error instanceof FeezbackHttpError && error.status === 404 && error.method === 'GET') {
        try {
          const pathname = decodeURIComponent(new URL(error.url, 'https://feezback.invalid').pathname);
          if (pathname === `/tpp/v1/users/${this.buildUserIdentifier(sub)}/consents`) return { consents: [] };
        } catch { /* Malformed URL cannot prove the identity is absent. */ }
      }
      throw error;
    }
    if (withInvalid && !Array.isArray(data) && !['consents', 'data', 'items'].some(key => Array.isArray(data?.[key]))) {
      throw new Error('Invalid Feezback consent response');
    }
    return this.normalizeConsentsResponse(data);
  }

  async terminateConsent(sub: string, consentId: string): Promise<void> {
    await this.ensureAuthorized(sub);
    await this.httpClient.delete(`/tpp/v1/users/${encodeURIComponent(this.buildUserIdentifier(sub))}/consents/${encodeURIComponent(consentId)}`, {
      sub, params: { reason: 'clientDisconnectedFromDigital' }, timeout: 60_000,
    });
  }

  async getUserAccounts(
    sub: string,
    options?: { preventUpdate?: boolean; withInvalid?: boolean; withBalances?: boolean },
  ): Promise<any> {
    // this.logger.log(`Fetching user accounts for sub=${sub}`);

    const queryParams: Record<string, string> = {};

    if (options?.preventUpdate !== undefined) {
      queryParams.preventUpdate = String(options.preventUpdate);
    }

    if (options?.withInvalid !== undefined) {
      queryParams.withInvalid = String(options.withInvalid);
    }

    if (options?.withBalances !== undefined) {
      queryParams.withBalances = String(options.withBalances);
    }

    return this.getFromUserPath(
      sub,
      '/accounts',
      Object.keys(queryParams).length ? queryParams : undefined,
    );
  }

  async getUserCards(
    sub: string,
    options?: { preventUpdate?: boolean; withInvalid?: boolean; withBalances?: boolean; strictResponse?: boolean },
  ): Promise<{ cards: any[] }> {
    const { preventUpdate = true, withInvalid, withBalances } = options ?? {};

    const queryParams: Record<string, string> = {
      preventUpdate: String(preventUpdate),
    };

    if (withInvalid !== undefined) {
      queryParams.withInvalid = String(withInvalid);
    }

    if (withBalances !== undefined) {
      queryParams.withBalances = String(withBalances);
    }

    const data = await this.getFromUserPath(sub, '/cards', queryParams);

    if (options?.strictResponse && !Array.isArray(data) && !Array.isArray(data?.cards) &&
      !Array.isArray(data?.data?.cards) && !Array.isArray(data?.data)) {
      throw new Error('Invalid Feezback cards response');
    }
    const cards = this.normalizeCardsResponse(data);
    return { cards };
  }

  async getAccountTransactions(
    sub: string,
    transactionsLink: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    // this.logger.log(`Fetching account transactions sub=${sub} bookingStatus=${bookingStatus}`);
    const url = this.buildTransactionsUrl(transactionsLink, bookingStatus, dateFrom, dateTo);
    return this.httpClient.get(url.toString(), {
      sub,
      timeout: 60_000,
    });
  }

  buildAbsoluteLink(href?: string | null): string | null {
    if (!href || typeof href !== 'string' || href.trim() === '') {
      return null;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }
    const baseUrl = this.authService.getTppApiUrl();
    return `${baseUrl}${href}`;
  }

  private async getFromUserPath(
    sub: string,
    suffix: string,
    queryParams?: Record<string, string>,
  ): Promise<any> {
    await this.ensureAuthorized(sub);
    const path = `/tpp/v1/users/${this.buildUserIdentifier(sub)}${suffix}`;
    const url = this.appendQueryParams(path, queryParams);
    return this.httpClient.get(url, {
      sub,
      timeout: 60_000,
    });
  }

  private async ensureAuthorized(sub: string): Promise<void> {
    await this.authService.getAccessToken(sub);
  }

  private buildUserIdentifier(sub: string): string {
    return `${sub}@${this.authService.getTppId()}`;
  }

  private buildTransactionsUrl(
    baseUrl: string,
    bookingStatus: string,
    dateFrom?: string,
    dateTo?: string,
  ): URL {
    const absoluteLink = this.buildAbsoluteLink(baseUrl);

    if (!absoluteLink) {
      throw new TypeError(`Invalid transactions link: ${baseUrl}`);
    }

    const url = new URL(absoluteLink);
    url.searchParams.set('bookingStatus', bookingStatus || 'booked');

    if (dateFrom && dateFrom.trim() !== '') {
      url.searchParams.set('dateFrom', dateFrom);
    }

    if (dateTo && dateTo.trim() !== '') {
      url.searchParams.set('dateTo', dateTo);
    }

    // Always use Feezback's cached data — prevents triggering a redundant ASPSP
    // refresh that causes 429 "Refresh Account task is already in progress".
    url.searchParams.set('preventUpdate', 'true');

    return url;
  }

  private normalizeConsentsResponse(data: any): { consents: any[] } {
    const rawConsents = this.extractArray(data);
    const consents = rawConsents.map(consent => ({
      resourceId: consent?.resourceId || consent?.consentId || consent?.id || null,
      consentStatus: consent?.status || consent?.consentStatus || null,
      validUntil: consent?.validUntil || consent?.expirationDate || consent?.expires || null,
      recurringIndicator: this.normalizeRecurringIndicator(consent?.recurringIndicator),
      aspspCode: consent?.aspspCode || consent?.bankId || consent?.institutionId || null,
      flowId: consent?.flowId || consent?.flow || null,
      context: consent?.context || null,
      access: consent?.access || consent?.accesses || null,
      meta: consent,
    }));

    return { consents };
  }

  private extractArray(data: any): any[] {
    if (Array.isArray(data)) {
      return data;
    }
    if (Array.isArray(data?.consents)) {
      return data.consents;
    }
    if (Array.isArray(data?.data)) {
      return data.data;
    }
    if (Array.isArray(data?.items)) {
      return data.items;
    }
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      const arrayKey = keys.find(key => Array.isArray((data as any)[key]));
      if (arrayKey) {
        return (data as any)[arrayKey];
      }
    }
    return [];
  }

  private normalizeCardsResponse(data: any): any[] {
    if (Array.isArray(data?.cards)) {
      return data.cards;
    }

    if (Array.isArray(data?.data?.cards)) {
      return data.data.cards;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    return this.extractArray(data);
  }

  private appendQueryParams(
    path: string,
    queryParams?: Record<string, string>,
  ): string {
    if (!queryParams || Object.keys(queryParams).length === 0) {
      return path;
    }

    const query = Object.entries(queryParams)
      .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    if (!query) {
      return path;
    }

    return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
  }

  private normalizeRecurringIndicator(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') {
        return true;
      }
      if (value.toLowerCase() === 'false') {
        return false;
      }
    }
    return null;
  }
}
