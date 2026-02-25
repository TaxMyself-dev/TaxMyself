import { Injectable, Logger } from '@nestjs/common';
import { FeezbackHttpClient } from '../core/feezback-http.client';
import { FeezbackAuthService } from '../core/feezback-auth.service';

@Injectable()
export class FeezbackConsentApiService {
  private readonly logger = new Logger(FeezbackConsentApiService.name);
  private readonly tppId: string;

  constructor(
    private readonly httpClient: FeezbackHttpClient,
    private readonly authService: FeezbackAuthService,
  ) {
    this.tppId = this.authService.getTppId();
  }

  getTppApiUrl(): string {
    return this.authService.getTppApiUrl();
  }

  buildUserIdentifier(sub: string): string {
    return `${sub}@${this.tppId}`;
  }

  async getUserCards(sub: string, consentId: string): Promise<{ cards: any[] }> {
    try {
      this.logger.log(`Getting user cards for sub: ${sub}, consentId: ${consentId}`);

      const userIdentifier = this.buildUserIdentifier(sub);
      const cardsUrl = `${this.getTppApiUrl()}/tpp/v1/users/${userIdentifier}/consents/${consentId}/cards`;

      this.logger.log(`Requesting cards from URL: ${cardsUrl}`);

      const data = await this.httpClient.get(cardsUrl, {
        sub,
        timeout: 60000,
      });

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        this.logger.debug(`User cards response keys: ${Object.keys(data).join(', ')}`);
      }

      let rawCards: any[] = [];

      if (Array.isArray(data)) {
        rawCards = data;
      } else if (Array.isArray((data as any)?.cards)) {
        rawCards = (data as any).cards;
      } else if (Array.isArray((data as any)?.cardAccounts)) {
        rawCards = (data as any).cardAccounts;
      } else if (Array.isArray((data as any)?.data?.cards)) {
        rawCards = (data as any).data.cards;
      } else if (data && typeof data === 'object') {
        const keys = Object.keys(data);
        const arrayKey = keys.find(key => Array.isArray((data as any)[key]));
        if (arrayKey) {
          this.logger.debug(`Detected cards array in key: ${arrayKey}`);
          rawCards = (data as any)[arrayKey];
        } else {
          this.logger.warn(`No cards array found in response. Keys: ${keys.join(', ')}`);
        }
      }

      const buildLink = (href?: string | null) => {
        if (!href || typeof href !== 'string' || href.trim() === '') {
          return null;
        }
        if (href.startsWith('http://') || href.startsWith('https://')) {
          return href;
        }
        const baseUrl = this.getTppApiUrl();
        return `${baseUrl}${href}`;
      };

      const transformedCards = Array.isArray(rawCards)
        ? rawCards.map(card => {
          const balancesHref = card?._links?.balances?.href
            || card?._links?.balance?.href
            || card?.links?.balances?.href
            || card?.links?.balance?.href
            || null;
          const transactionsHref = card?._links?.transactions?.href
            || card?.links?.transactions?.href
            || null;

          return {
            resourceId: card?.resourceId || card?.cardResourceId || card?.id || null,
            maskedPan: card?.maskedPan || card?.pan || null,
            name: card?.name || card?.displayName || card?.alias || null,
            ownerName: card?.ownerName || card?.owner || null,
            currency: card?.currency || card?.balancesCurrency || null,
            product: card?.product || card?.cardProduct || null,
            cashAccountType: card?.cashAccountType === 'CARD' ? 'CARD' : null,
            balancesLink: buildLink(balancesHref),
            transactionsLink: buildLink(transactionsHref),
          };
        })
        : [];

      this.logger.debug(`Transformed ${transformedCards.length} cards`);

      return {
        cards: transformedCards,
      };
    } catch (error: any) {
      if (error?.response?.status === 404) {
        this.logger.warn(
          `User cards not found (404) for sub: ${sub}, consentId: ${consentId}. This usually means the user hasn't completed the consent flow yet.`,
        );

        if (error?.response?.data) {
          this.logger.warn(
            `Feezback 404 response: ${JSON.stringify(error.response.data)}`,
          );
        }

        const friendlyError = new Error(
          'User cards not found. Please complete the Feezback consent flow first.',
        );
        (friendlyError as any).status = 404;
        (friendlyError as any).code = 'CARDS_NOT_FOUND';
        throw friendlyError;
      }

      this.logger.error(
        `Error getting user cards: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      if (error?.response?.status) {
        (error as any).status = error.response.status;
      }

      throw error;
    }
  }

  async getCardBalances(sub: string, consentId: string, cardResourceId: string): Promise<any> {
    try {
      this.logger.log(`Getting card balances for sub: ${sub}, consentId: ${consentId}, cardResourceId: ${cardResourceId}`);

      const userIdentifier = this.buildUserIdentifier(sub);
      const balancesUrl = `${this.getTppApiUrl()}/tpp/v1/users/${userIdentifier}/consents/${consentId}/cards/${cardResourceId}/balances`;

      this.logger.log(`Requesting card balances from URL: ${balancesUrl}`);

      const data = await this.httpClient.get(balancesUrl, {
        sub,
        timeout: 60000,
      });

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        this.logger.debug(`Card balances response keys: ${Object.keys(data).join(', ')}`);
      }

      return data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        this.logger.warn(
          `Card balances not found (404) for sub: ${sub}, consentId: ${consentId}, cardResourceId: ${cardResourceId}.`,
        );

        if (error?.response?.data) {
          this.logger.warn(
            `Feezback 404 response: ${JSON.stringify(error.response.data)}`,
          );
        }

        const friendlyError = new Error('Card balances not found.');
        (friendlyError as any).status = 404;
        throw friendlyError;
      }

      this.logger.error(
        `Error getting card balances: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      if (error?.response?.status) {
        (error as any).status = error.response.status;
      }

      throw error;
    }
  }

  async getCardTransactions(
    sub: string,
    consentId: string,
    cardResourceId: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    try {
      this.logger.log(`Getting card transactions for sub: ${sub}, consentId: ${consentId}, cardResourceId: ${cardResourceId}`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const userIdentifier = this.buildUserIdentifier(sub);
      const transactionsBaseUrl = `${this.getTppApiUrl()}/tpp/v1/users/${userIdentifier}/consents/${consentId}/cards/${cardResourceId}/transactions`;

      const url = new URL(transactionsBaseUrl);
      url.searchParams.set('bookingStatus', bookingStatus || 'booked');

      if (dateFrom && dateFrom.trim() !== '') {
        url.searchParams.set('dateFrom', dateFrom);
      }

      if (dateTo && dateTo.trim() !== '') {
        url.searchParams.set('dateTo', dateTo);
      }

      this.logger.log(`Requesting card transactions from URL: ${url.toString()}`);
      const data = await this.httpClient.get(url.toString(), {
        sub,
        timeout: 60000,
      });

      return data;
    } catch (error: any) {
      const isRateLimit = error?.response?.status === 429
        || error?.status === 429
        || error?.message?.includes('429')
        || error?.code === 'TOO_MANY_REQUESTS';

      if (isRateLimit) {
        this.logger.warn(
          `Rate limit error getting card transactions: ${error?.message}`,
        );
      } else if (error?.response?.status === 404) {
        this.logger.warn(
          `Card transactions not found (404) for sub: ${sub}, consentId: ${consentId}, cardResourceId: ${cardResourceId}.`,
        );

        if (error?.response?.data) {
          this.logger.warn(
            `Feezback 404 response: ${JSON.stringify(error.response.data)}`,
          );
        }

        const friendlyError = new Error('Card transactions not found.');
        (friendlyError as any).status = 404;
        throw friendlyError;
      } else {
        this.logger.error(
          `Error getting card transactions: ${error?.message}`,
          error?.stack,
        );
      }

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      if (error?.response?.status) {
        (error as any).status = error.response.status;
      }

      throw error;
    }
  }
}
