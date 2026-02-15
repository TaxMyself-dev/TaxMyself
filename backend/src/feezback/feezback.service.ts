import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeezbackJwtService } from './feezback-jwt.service';
import { Transactions } from '../transactions/transactions.entity';
import { FeezbackConsent } from './consent/entities/feezback-consent.entity';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { ConsentSyncService } from './consent/consent-sync.service';

@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  private readonly tppId: string;

  constructor(
    private readonly feezbackJwtService: FeezbackJwtService,
    private readonly authService: FeezbackAuthService,
    @InjectRepository(Transactions)
    private readonly transactionsRepo: Repository<Transactions>,
    private readonly feezbackApiService: FeezbackApiService,
    private readonly feezbackConsentApiService: FeezbackConsentApiService,
    private readonly consentSyncService: ConsentSyncService,
  ) {
    this.tppId = this.authService.getTppId();
  }

  getTppId(): string {
    return this.tppId;
  }

  getTppApiUrl(): string {
    return this.authService.getTppApiUrl();
  }

  async createConsentLink(firebaseId: string) {
    return this.feezbackApiService.createConsentLink(firebaseId);
  }

  async syncUserConsents(firebaseId: string, sub: string): Promise<FeezbackConsent[]> {
    return this.consentSyncService.syncUserConsents(firebaseId, sub, this.tppId);
  }

  async getUserConsents(sub: string): Promise<{ consents: any[] }> {
    return this.feezbackApiService.getUserConsents(sub);
  }

  async getUserCards(sub: string, consentId: string): Promise<{ cards: any[] }> {
    return this.feezbackConsentApiService.getUserCards(sub, consentId);
  }

  async getCardBalances(sub: string, consentId: string, cardResourceId: string): Promise<any> {
    return this.feezbackConsentApiService.getCardBalances(sub, consentId, cardResourceId);
  }

  async getCardTransactions(
    sub: string,
    consentId: string,
    cardResourceId: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    return this.feezbackConsentApiService.getCardTransactions(
      sub,
      consentId,
      cardResourceId,
      bookingStatus,
      dateFrom,
      dateTo,
    );
  }

  async getAccessToken(sub: string): Promise<string> {
    try {
      const token = await this.authService.getAccessToken(sub);
      return token;
    } catch (error: any) {
      this.logger.error(
        `Error getting access token: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  async getUserAccounts(sub: string): Promise<any> {
    return this.feezbackApiService.getUserAccounts(sub);
  }

  /**
   * Gets transactions for a specific account
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @param transactionsLink - Full URL to the transactions endpoint
   * @param bookingStatus - Booking status filter (default: "booked")
   * @param dateFrom - Start date for transactions (format: YYYY-MM-DD)
   * @param dateTo - End date for transactions (format: YYYY-MM-DD)
   * @returns Transactions data
   */
  async getAccountTransactions(
    sub: string,
    transactionsLink: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    return this.feezbackApiService.getAccountTransactions(sub, transactionsLink, bookingStatus, dateFrom, dateTo);
  }

  /**
   * Extracts firebaseId from context string
   * @param context - Context string (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_context")
   * @returns Firebase ID
   */
  extractFirebaseIdFromContext(context: string): string {
    if (context.endsWith('_context')) {
      return context.replace('_context', '');
    }
    return context;
  }

  /**
   * Extracts sub from user identifier
   * @param user - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub@KNCAXnwXk1")
   * @returns Sub identifier
   */
  extractSubFromUser(user: string): string {
    // Remove @TPP_ID part
    const parts = user.split('@');
    return parts[0];
  }

  /**
   * Saves Feezback transactions to the database (bank flow)
   * Provided for backward compatibility with existing bank sync flows.
   */
  async saveTransactionsToDatabase(
    transactions: any[],
    userId: string,
    accountInfoMap: { [accountName: string]: any } = {},
    transactionToAccountMap: { [transactionId: string]: string } = {},
  ): Promise<{ saved: number; skipped: number; message: string }> {
    return this.saveBankTransactionsToDatabase(transactions, userId, accountInfoMap, transactionToAccountMap);
  }

  /**
   * Saves bank transactions to the database.
   */
  async saveBankTransactionsToDatabase(
    transactions: any[],
    userId: string,
    accountInfoMap: { [accountName: string]: any } = {},
    transactionToAccountMap: { [transactionId: string]: string } = {},
  ): Promise<{ saved: number; skipped: number; message: string }> {
    this.logger.log(`Saving ${transactions.length} bank transactions to database for user: ${userId}`);

    const externalIds = transactions
      .map(tx => tx?.transactionId)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const existingSet = await this.buildExistingTransactionSet(userId, externalIds);

    const transactionsToSave: Transactions[] = [];
    let skippedCount = 0;

    for (const tx of transactions) {
      const externalId = tx?.transactionId;

      if (!externalId || typeof externalId !== 'string' || externalId.trim() === '') {
        this.logger.warn('Skipping bank transaction without transactionId');
        skippedCount++;
        continue;
      }

      if (existingSet.has(externalId)) {
        this.logger.debug(`Bank transaction with finsiteId ${externalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const transaction = this.buildBaseTransactionEntity(tx, userId);
      if (!transaction) {
        skippedCount++;
        continue;
      }

      const accountName = transactionToAccountMap[externalId] || null;
      const accountInfo = accountName ? accountInfoMap[accountName] : null;

      transaction.finsiteId = externalId;
      transaction.paymentIdentifier = this.resolveBankPaymentIdentifier(tx, accountInfo);

      transactionsToSave.push(transaction);
    }

    return this.persistTransactions(transactionsToSave, skippedCount);
  }

  async saveCardTransactionsToDatabase(
    transactions: any[],
    userId: string,
    cardInfoMap: { [cardName: string]: any } = {},
    transactionToCardMap: { [externalId: string]: string } = {},
  ): Promise<{ saved: number; skipped: number; message: string }> {
    this.logger.log(`Saving ${transactions.length} card transactions to database for user: ${userId}`);

    const externalIds = transactions
      .map(tx => this.extractCardExternalId(tx))
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const existingSet = await this.buildExistingTransactionSet(userId, externalIds);

    const transactionsToSave: Transactions[] = [];
    let skippedCount = 0;

    for (const tx of transactions) {
      const externalId = this.extractCardExternalId(tx);

      if (!externalId) {
        this.logger.warn('Skipping card transaction without external identifier');
        skippedCount++;
        continue;
      }

      if (existingSet.has(externalId)) {
        this.logger.debug(`Card transaction with finsiteId ${externalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const transaction = this.buildBaseTransactionEntity(tx, userId);
      if (!transaction) {
        skippedCount++;
        continue;
      }

      const cardName = transactionToCardMap[externalId] || null;
      const cardInfo = cardName ? cardInfoMap[cardName] : null;

      transaction.finsiteId = externalId;
      transaction.paymentIdentifier = this.resolveCardPaymentIdentifier(tx, cardInfo);

      transactionsToSave.push(transaction);
    }

    return this.persistTransactions(transactionsToSave, skippedCount);
  }

  async getAndSaveUserCardTransactions(
    userId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
    cardResourceId?: string,
  ): Promise<any> {

    const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
      withBalances: true,
      withInvalid: true,
      preventUpdate: false,
    });

    const cards = cardsResponse?.cards || [];
    // console.log("ששששששששששששששששששששששששששששששששששששששששששששששששששששששששששש ~ cards:", cards)
    const filteredCards = cardResourceId
      ? cards.filter(card => card?.resourceId === cardResourceId)
      : cards;

    const cardInfoMap: { [cardName: string]: any } = {};
    const transactionToCardMap: { [externalId: string]: string } = {};
    const cardsResult: any[] = [];
    const allTransactions: any[] = [];

    for (const card of filteredCards) {
      const cardId = card?.resourceId;

      if (!cardId) {
        this.logger.warn('Skipping card without resourceId');
        continue;
      }

      const consentId = card?.consentId
        || card?.relatedConsents?.[0]?.resourceId
        || null;

      if (!consentId) {
        this.logger.warn(`Skipping card ${cardId} without consentId`);
        continue;
      }

      const cardName = card?.displayName
        || card?.name
        || card?.maskedPan
        || cardId;

      cardInfoMap[cardName] = card;

      const transactionsResponse = await this.feezbackConsentApiService.getCardTransactions(
        sub,
        consentId,
        cardId,
        bookingStatus,
        dateFrom,
        dateTo,
      );
      console.log("🚀 ~ FeezbackService ~ getAndSaveUserCardTransactions ~ transactionsResponse:", transactionsResponse)

      const transactions = this.extractCardTransactions(transactionsResponse);

      transactions.forEach(tx => {
        const externalId = this.extractCardExternalId(tx);
        if (externalId) {
          transactionToCardMap[externalId] = cardName;
        }
      });

      cardsResult.push({
        cardResourceId: cardId,
        displayName: cardName,
        maskedPan: card?.maskedPan,
        consentId,
        transactions,
      });

      allTransactions.push(...transactions);
    }

    const saveResult = await this.saveCardTransactionsToDatabase(
      allTransactions,
      userId,
      cardInfoMap,
      transactionToCardMap,
    );

    return {
      asOf: new Date().toISOString(),
      bookingStatus,
      dateFrom,
      dateTo,
      cardsProcessed: cardsResult.length,
      saveResult,
      cards: cardsResult,
    };
  }

  private extractCardTransactions(response: any): any[] {
    if (!response) {
      return [];
    }

    const booked = response?.transactions?.booked
      || response?.data?.transactions?.booked
      || response?.booked
      || response?.data?.booked;

    if (Array.isArray(booked)) {
      return booked;
    }

    if (Array.isArray(response?.transactions)) {
      return response.transactions;
    }

    if (Array.isArray(response?.data?.transactions)) {
      return response.data.transactions;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return Array.isArray(response) ? response : [];
  }

  private extractCardExternalId(tx: any): string | null {
    const externalId = tx?.cardTransactionId || tx?.transactionId;
    return typeof externalId === 'string' && externalId.trim() !== '' ? externalId : null;
  }

  private async buildExistingTransactionSet(userId: string, finsiteIds: string[]): Promise<Set<string>> {
    if (!finsiteIds || finsiteIds.length === 0) {
      return new Set();
    }

    const uniqueIds = Array.from(new Set(finsiteIds));

    const existing = await this.transactionsRepo.find({
      select: ['finsiteId'],
      where: {
        userId,
        finsiteId: In(uniqueIds),
      },
    });

    return new Set(existing.map(item => item.finsiteId));
  }

  private buildBaseTransactionEntity(tx: any, userId: string): Transactions | null {
    const transaction = new Transactions();

    transaction.userId = userId;
    transaction.name = tx?.remittanceInformationUnstructured
      || tx?._aggregate?.standardName
      || tx?.description
      || 'Unknown Transaction';

    const billDate = this.parseTxDate(tx);
    if (!billDate) {
      this.logger.warn('Skipping transaction without valid date');
      return null;
    }
    transaction.billDate = billDate;

    const amount = this.parseTxAmount(tx);
    if (amount === null) {
      this.logger.warn('Skipping transaction with invalid amount');
      return null;
    }
    transaction.sum = amount;

    transaction.note2 = tx?.additionalInformation || null;
    transaction.category = tx?._aggregate?.category || null;

    transaction.billName = null;
    transaction.businessNumber = null;
    transaction.subCategory = null;
    transaction.isRecognized = false;
    transaction.vatPercent = 0;
    transaction.taxPercent = 0;
    transaction.isEquipment = false;
    transaction.reductionPercent = 0;
    transaction.vatReportingDate = null;
    transaction.confirmed = false;

    return transaction;
  }

  private parseTxDate(tx: any): Date | null {
    const dateStr = tx?.bookingDate || tx?.valueDate;
    if (!dateStr) {
      return null;
    }

    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseTxAmount(tx: any): number | null {
    console.log("🚀 ~ FeezbackService ~ parseTxAmount ~ tx:", tx)
    const rawAmount = tx?.transactionAmount?.amount
      || tx?.transactionAmount
      || tx?.grandTotalAmount?.amount
      || tx?.grandTotalAmount
      || tx?.originalAmount?.amount
      || tx?.originalAmount;

    console.log("🚀 ~ FeezbackService ~ parseTxAmount ~ rawAmount:", rawAmount)
    if (rawAmount === undefined || rawAmount === null) {
      return null;
    }

    const parsed = parseFloat(rawAmount.toString().replace(/,/g, ''));
    console.log("🚀 ~ FeezbackService ~ parseTxAmount ~ parsed:", parsed)
    return Number.isNaN(parsed) ? null : parsed;
  }

  private resolveBankPaymentIdentifier(tx: any, accountInfo: any): string {
    if (accountInfo?.iban) {
      return accountInfo.iban;
    }

    if (tx?.entryReference) {
      return tx.entryReference;
    }

    const txId = tx?.transactionId || '';
    return `feezback-${txId.substring(0, 8)}`;
  }

  private resolveCardPaymentIdentifier(tx: any, cardInfo: any): string {
    const maskedPan = cardInfo?.maskedPan;

    if (maskedPan) {
      const match = maskedPan.match(/(\d{4})$/);
      if (match) {
        return match[1];
      }
    }

    if (cardInfo?.name) {
      const match = cardInfo.name.match(/(\d{4})$/);
      if (match) {
        return match[1];
      }
    }

    if (tx?.entryReference && /^\d{4}$/.test(tx.entryReference)) {
      return tx.entryReference;
    }

    const externalId = this.extractCardExternalId(tx) || '';
    return `feezback-${externalId.substring(0, 8)}`;
  }

  private async persistTransactions(
    transactions: Transactions[],
    skippedCount: number,
  ): Promise<{ saved: number; skipped: number; message: string }> {
    if (transactions.length === 0) {
      this.logger.log('No new transactions to save (all were duplicates or invalid)');
      return {
        saved: 0,
        skipped: skippedCount,
        message: `Successfully saved 0 transactions. Skipped ${skippedCount} duplicate or invalid transactions.`,
      };
    }

    try {
      this.logger.log(`Attempting to save ${transactions.length} transactions in batch...`);
      const savedResult = await this.transactionsRepo.save(transactions);
      const savedCount = Array.isArray(savedResult)
        ? savedResult.length
        : savedResult
          ? 1
          : 0;

      this.logger.log(`✅ Successfully saved ${savedCount} transactions to database`);

      return {
        saved: savedCount,
        skipped: skippedCount,
        message: `Successfully saved ${savedCount} transactions. Skipped ${skippedCount} duplicate or invalid transactions.`,
      };
    } catch (error: any) {
      this.logger.error(`❌ Error during batch save: ${error.message}`, error.stack);
      throw new Error(`Failed to save transactions to database: ${error.message}`);
    }
  }

}
