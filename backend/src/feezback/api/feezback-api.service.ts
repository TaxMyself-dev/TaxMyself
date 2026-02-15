import { Injectable, Logger } from '@nestjs/common';
import { FeezbackHttpClient } from '../core/feezback-http.client';
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

  async createConsentLink(firebaseId: string): Promise<any> {
    const token = await this.feezbackJwtService.generateConsentJwt(firebaseId);
    this.logger.debug(`Requesting consent link for firebaseId=${firebaseId}`);
    return this.httpClient.post(this.authService.getLgsUrl(), { token });
  }

  async getUserConsents(sub: string): Promise<{ consents: any[] }> {
    this.logger.log(`Fetching user consents for sub=${sub}`);
    const data = await this.getFromUserPath(sub, '/consents');
    return this.normalizeConsentsResponse(data);
  }

  async getUserAccounts(sub: string): Promise<any> {
    this.logger.log(`Fetching user accounts for sub=${sub}`);
    return this.getFromUserPath(sub, '/accounts');
  }

  async getUserCards(
    sub: string,
    options?: { preventUpdate?: boolean; withInvalid?: boolean; withBalances?: boolean },
  ): Promise<{ cards: any[] }> {
    this.logger.log(`Fetching user cards for sub=${sub}`);

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

    const data = await this.getFromUserPath(
      sub,
      '/cards',
      Object.keys(queryParams).length ? queryParams : undefined,
    );

    const cards = this.normalizeCardsResponse(data);
    // console.log("🚀 ~ FeezbackApiService ~ getUserCards ~ cards:", cards)
    return { cards };
  }

  async getAccountTransactions(
    sub: string,
    transactionsLink: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    this.logger.log(`Fetching account transactions sub=${sub} bookingStatus=${bookingStatus}`);
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
