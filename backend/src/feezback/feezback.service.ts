import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackJwtService } from './feezback-jwt.service';
import { FeezbackConsent } from './consent/entities/feezback-consent.entity';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { ConsentSyncService } from './consent/consent-sync.service';
import { TransactionProcessingService } from '../transactions/transaction-processing.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { UserSyncState } from '../transactions/user-sync-state.entity';
import { NormalizedTransaction } from '../transactions/interfaces/normalized-transaction.interface';
import { User } from '../users/user.entity';
import { ModuleName } from '../enum';
import * as fs from 'fs';
import * as path from 'path';
@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  private readonly tppId: string;

  constructor(
    private readonly feezbackJwtService: FeezbackJwtService,
    private readonly authService: FeezbackAuthService,
    private readonly feezbackApiService: FeezbackApiService,
    private readonly feezbackConsentApiService: FeezbackConsentApiService,
    private readonly consentSyncService: ConsentSyncService,
    private readonly processingService: TransactionProcessingService,
    private readonly userSyncStateService: UserSyncStateService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {
    this.tppId = this.authService.getTppId();
  }


  /**
   * Save transactions to JSON files for inspection
   * Creates two files: raw response and simplified transactions
   * @returns File paths if successful, null if failed
   */
  saveTransactionsToFile(
    firebaseId: string,
    transactions: any[],
    transactionsByAccount: { [accountName: string]: any[] },
    accountInfoMap: { [accountName: string]: any } = {},
  ): { raw: string | null; simplified: string | null } {
    const result = { raw: null, simplified: null };

    try {
      // Use __dirname relative path or process.cwd()
      const baseDir = process.cwd();
      const outputDir = path.join(baseDir, 'src', 'feezback', 'transactions-data');

      // this.logger.log(`Attempting to save transactions to: ${outputDir}`);
      // this.logger.log(`Current working directory: ${baseDir}`);

      // Create directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        // this.logger.log(`Creating directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // ===== FILE 1: Raw response as-is =====
      const rawFileName = `transactions-raw-${firebaseId}-${timestamp}.json`;
      const rawFilePath = path.join(outputDir, rawFileName);

      const rawOutput = {
        transactions: transactions,
        transactionsByAccount: transactionsByAccount,
        metadata: {
          totalTransactions: transactions.length,
          accountsProcessed: Object.keys(transactionsByAccount).length,
          dateGenerated: new Date().toISOString(),
          firebaseId,
        },
      };

      fs.writeFileSync(rawFilePath, JSON.stringify(rawOutput, null, 2), 'utf8');

      if (fs.existsSync(rawFilePath)) {
        const stats = fs.statSync(rawFilePath);
        // this.logger.log(`✅ Raw transactions saved to: ${rawFilePath}`);
        // this.logger.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
        result.raw = rawFilePath;
      }

      // ===== FILE 2: Simplified transactions with only essential fields =====
      const simplifiedFileName = `transactions-simplified-${firebaseId}-${timestamp}.json`;
      const simplifiedFilePath = path.join(outputDir, simplifiedFileName);

      // Create a map to find which account a transaction belongs to
      const transactionToAccountMap: { [transactionId: string]: string } = {};
      Object.keys(transactionsByAccount).forEach(accountName => {
        const accountTxs = transactionsByAccount[accountName] || [];
        accountTxs.forEach((tx: any) => {
          const txId = tx.transactionId;
          if (txId) {
            transactionToAccountMap[txId] = accountName;
          }
        });
      });

      const simplifiedTransactions = transactions.map(tx => {
        const txId = tx.transactionId;
        const accountName = transactionToAccountMap[txId];
        const accountInfo = accountName ? accountInfoMap[accountName] : null;

        // Determine source account identifier
        let sourceAccount: string | null = null;
        if (accountInfo) {
          // For bank accounts, use IBAN
          if (accountInfo.iban) {
            sourceAccount = accountInfo.iban;
          }
          // For credit cards, use maskedPan
          else if (accountInfo.maskedPan) {
            sourceAccount = accountInfo.maskedPan;
          }
          // Fallback to account name
          else if (accountInfo.name) {
            sourceAccount = accountInfo.name;
          }
        }

        return {
          // Unique identifier
          transactionId: txId || null,

          // Dates
          bookingDate: tx.bookingDate || null,
          valueDate: tx.valueDate || null,
          referenceTime: tx.referenceTime || null,

          // Amount
          amount: tx.transactionAmount?.amount || null,
          currency: tx.transactionAmount?.currency || null,

          // Category and description
          // category: tx._aggregate?.category || null,
          standardName: tx._aggregate?.standardName || null,
          description: tx.remittanceInformationUnstructured || tx.remittanceInformationStructured || null,

          // Parties
          creditorName: tx.creditorName || null,
          debtorName: tx.debtorName || null,

          // Source account (where transaction comes from)
          sourceAccount: sourceAccount,
          sourceAccountName: accountName || null,
          sourceAccountType: accountInfo?.cashAccountType || null, // CACC for bank, CARD for credit card

          // Additional info
          additionalInformation: tx.additionalInformation || null,
          entryReference: tx.entryReference || null,
          consentId: tx.consentId || null,
        };
      });

      const simplifiedOutput = {
        metadata: {
          totalTransactions: simplifiedTransactions.length,
          accountsProcessed: Object.keys(transactionsByAccount).length,
          dateGenerated: new Date().toISOString(),
          firebaseId,
        },
        transactions: simplifiedTransactions,
        transactionsByAccount: Object.keys(transactionsByAccount).reduce((acc, accountName) => {
          const accountTxs = transactionsByAccount[accountName] || [];
          acc[accountName] = accountTxs.map(tx => {
            return {
              transactionId: tx.transactionId || null,
              bookingDate: tx.bookingDate || null,
              valueDate: tx.valueDate || null,
              amount: tx.transactionAmount?.amount || null,
              currency: tx.transactionAmount?.currency || null,
              // category: tx._aggregate?.category || null,
              standardName: tx._aggregate?.standardName || null,
              description: tx.remittanceInformationUnstructured || null,
            };
          });
          return acc;
        }, {} as { [key: string]: any[] }),
      };

      fs.writeFileSync(simplifiedFilePath, JSON.stringify(simplifiedOutput, null, 2), 'utf8');

      if (fs.existsSync(simplifiedFilePath)) {
        const stats = fs.statSync(simplifiedFilePath);
        // this.logger.log(`✅ Simplified transactions saved to: ${simplifiedFilePath}`);
        // this.logger.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
        result.simplified = simplifiedFilePath;
      }

      return result;
    } catch (error: any) {
      // this.logger.error(`❌ Failed to save transactions to file: ${error.message}`, error.stack);
      // this.logger.error(`   Error code: ${error.code}`);
      // this.logger.error(`   Error path: ${error.path}`);
      return result;
    }
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
      // this.logger.error(
      //   `Error getting access token: ${error?.message}`,
      //   error?.stack,
      // );

      if (error?.response?.data) {
        // this.logger.error(
        //   `Feezback error response: ${JSON.stringify(error.response.data)}`,
        // );
      }

      throw error;
    }
  }

  async getUserAccounts(sub: string): Promise<any> {
    return this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true, withInvalid: false, withBalances: true });
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

  private normalizeMaskedPan(maskedPan?: string | null): string {
    return (maskedPan ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private dedupeCardsPreferActive(cards: any[]): any[] {
    const map = new Map<string, any>();
  
    for (const card of cards) {
      const key = this.normalizeMaskedPan(card?.maskedPan);
      if (!key) continue;
  
      const existing = map.get(key);
  
      // אם אין עדיין כרטיס — שמור
      if (!existing) {
        map.set(key, card);
        continue;
      }
  
      const existingExpired = existing?.consentStatus === 'expired';
      const currentExpired = card?.consentStatus === 'expired';
  
      // אם הקיים expired והחדש לא — תחליף
      if (existingExpired && !currentExpired) {
        map.set(key, card);
      }
  
      // אחרת לא עושים כלום (שומרים את הקיים)
    }
  
    return Array.from(map.values());
  }

  private readonly runningCardSyncByUser = new Map<string, Promise<any>>();

  private async getAndSaveUserCardTransactionsInternal(
    userId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
    cardResourceId?: string,
  ): Promise<any> {
    this.logger.log(`[DIAG] CARD_START | userId=${userId?.substring(0, 8)}... | dateFrom=${dateFrom} | dateTo=${dateTo}`);

    const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
      withBalances: true,
      withInvalid: false,
      preventUpdate: true,
    });
    const cards = this.dedupeCardsPreferActive(cardsResponse?.cards);
    // const cards = cardsResponse?.cards || [];
    const cardCount = cards?.length ?? 0;
    this.logger.log(`[DIAG] CARD_CARDS_FETCHED | count=${cardCount} | userId=${userId?.substring(0, 8)}...`);

    const filteredCards = cardResourceId
      ? cards.filter(card => card?.resourceId === cardResourceId)
      : cards;

    const cardInfoMap: Record<string, any> = {};
    const cardsResult: any[] = [];

    // ✅ נשמור טרנזקציות עם מטא (רק לקובץ/דיבוג) + רגילות ל-DB
    const allTransactionsForDb: any[] = [];
    const allTransactionsForFile: any[] = [];

    // ✅ חלוקה לפי כרטיס לקובץ
    const transactionsByCard: Record<string, any[]> = {};

    const cardErrors: Array<{
      cardResourceId: string;
      consentId: string | null;
      displayName: string;
      status?: number;
      code?: string;
      message: string;
      responseData?: any;
    }> = [];

    // ✅ PACING
    const pacingMs = 1500;

    // cooldown after GET /cards before first cardTransactions request
    if (filteredCards.length > 0) {
      // await this.sleep(1500);
    }

    for (let i = 0; i < filteredCards.length; i++) {
      const card = filteredCards[i];
      const cardId = card?.resourceId;

      if (!cardId) {
        this.logger.warn('Skipping card without resourceId');
        continue;
      }

      const consentId =
        card?.consentId ||
        card?.relatedConsents?.[0]?.resourceId ||
        null;

      const cardName =
        card?.displayName ||
        card?.name ||
        card?.maskedPan ||
        cardId;

      cardInfoMap[cardId] = card;

      if (i > 0 && pacingMs > 0) {
        // await this.sleep(pacingMs);
      }

      try {
        if (!consentId) {
          throw Object.assign(new Error('Missing consentId for card'), { status: 400 });
        }

        const transactionsResponse =
          await this.feezbackConsentApiService.getCardTransactions(
            sub,
            consentId,
            cardId,
            bookingStatus,
            dateFrom,
            dateTo,
          );

        const transactions = this.extractCardTransactions(transactionsResponse);

        this.logger.log(
          `[DIAG] CARD_FETCH | card=${cardName} | index=${i + 1}/${filteredCards.length} | extracted=${transactions.length}`,
        );

        // ✅ מטא שנוסיף לכל טרנזקציה (לקובץ בלבד)
        const cardMeta = {
          cardResourceId: cardId,
          displayName: cardName,
          maskedPan: card?.maskedPan ?? null,
          consentId,
        };

        const transactionsWithMeta = transactions.map(tx => ({
          ...tx,
          __cardMeta: cardMeta,
        }));

        // ✅ לקובץ: טרנזקציות עם מטא
        transactionsByCard[cardName] = transactionsWithMeta;
        allTransactionsForFile.push(...transactionsWithMeta);

        // ✅ ל-DB: נשמור טרנזקציות כולל מטא
        allTransactionsForDb.push(...transactionsWithMeta);

        cardsResult.push({
          cardResourceId: cardId,
          displayName: cardName,
          maskedPan: card?.maskedPan,
          consentId,
          transactions, // המקוריות (בלי מטא)
        });
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status;
        const code = err?.code;
        const message = err?.message || 'Unknown error';

        this.logger.warn(
          `[DIAG] CARD_FAILED | card=${cardName} | cardId=${cardId} | index=${i + 1}/${filteredCards.length} | consent=${consentId} | status=${status} | error=${message}`,
        );

        cardErrors.push({
          cardResourceId: cardId,
          consentId,
          displayName: cardName,
          status,
          code,
          message,
          responseData: err?.response?.data
            ? (typeof err.response.data === 'string'
              ? err.response.data.slice(0, 500)
              : err.response.data)
            : undefined,
        });

        // כדי שבקובץ תראה שהכרטיס היה קיים אבל נכשל
        if (!(cardName in transactionsByCard)) {
          transactionsByCard[cardName] = [{
            __cardMeta: {
              cardResourceId: cardId,
              displayName: cardName,
              maskedPan: card?.maskedPan ?? null,
              consentId,
            },
            __error: {
              status,
              code,
              message,
            },
          }];
        }

        continue;
      }
    }

    this.logger.log(
      `[DIAG] CARD_EXTRACTION_TOTAL | cards_attempted=${filteredCards.length} | cards_succeeded=${cardsResult.length} | cards_failed=${cardErrors.length} | total_extracted=${allTransactionsForDb.length}`,
    );

    // ✅ שמירה לקובץ פעם אחת בסוף (עם __cardMeta)
    const savedFilePaths = this.saveTransactionsToFile(
      userId,
      allTransactionsForFile,
      transactionsByCard,
      cardInfoMap,
    );
    this.logger.log(`Saved raw/simplified card transactions files: ${JSON.stringify(savedFilePaths)}`);

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    let normalizedTransactions: NormalizedTransaction[] = [];
    let processingError: string | null = null;
    const databaseSaveResult: { saved: number; skipped: number; message: string } | null = null;
    try {
      this.logger.log(`[DIAG] CARD_NORMALIZE_START | input=${allTransactionsForDb.length} | userId=${userId?.substring(0, 8)}...`);
      normalizedTransactions = this.normalizeCardTransactions(allTransactionsForDb, cardInfoMap);
      this.logger.log(`[DIAG] CARD_NORMALIZE_DONE | normalized=${normalizedTransactions.length} | userId=${userId?.substring(0, 8)}...`);
    } catch (err: any) {
      this.logger.error(`[DIAG] CARD_NORMALIZE_FAILED | userId=${userId?.substring(0, 8)}... | error=${err.message}`, err.stack);
      processingError = err.message;
    }

    const cardNormalizedCount = normalizedTransactions.length;
    const syncSummary = {
      bank: { banksProcessed: 0, transactionsFetched: 0 },
      card: {
        cardsProcessed: cardsResult.length,
        transactionsFetched: cardNormalizedCount,
      },
      system: {
        totalProcessed: cardNormalizedCount,
        savedInCurrentImport: 0,
        alreadyExisting: 0,
      },
    };

    return {
      asOf: new Date().toISOString(),
      bookingStatus,
      dateFrom,
      dateTo,

      // Normalized fields (aligned with bank response shape)
      transactions: allTransactionsForDb,
      totalTransactions: allTransactionsForDb.length,
      accountsProcessed: filteredCards.length,
      databaseSaveResult,

      // Card-specific fields
      cardsProcessed: filteredCards.length,
      cardsSucceeded: cardsResult.length,
      cardsFailed: cardErrors.length,

      savedFilePaths,
      normalizedTransactions,
      processingError,
      cards: cardsResult,
      cardErrors,

      syncSummary,
    };
  }

  // private sleep(ms: number) {
  //   return new Promise(resolve => setTimeout(resolve, ms));
  // }

  async getAndSaveUserCardTransactions(
    userId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
    cardResourceId?: string,
  ): Promise<any> {
    const key = `${userId}:${sub}:cards`;

    const existing = this.runningCardSyncByUser.get(key);
    if (existing) {
      this.logger.warn(`[DIAG] CARD_SYNC_REUSED — already running for key=${key}`);
      return existing;
    }

    this.logger.log(`[DIAG] CARD_SYNC_STARTING | userId=${userId?.substring(0, 8)}... | dateFrom=${dateFrom} | dateTo=${dateTo}`);

    const promise = (async () => {
      try {
        return await this.getAndSaveUserCardTransactionsInternal(
          userId,
          sub,
          bookingStatus,
          dateFrom,
          dateTo,
          cardResourceId,
        );
      } finally {
        this.runningCardSyncByUser.delete(key);
        this.logger.log(`[DIAG] CARD_SYNC_FINISHED | userId=${userId?.substring(0, 8)}... | key=${key}`);
      }
    })();

    this.runningCardSyncByUser.set(key, promise);
    return promise;
  }

  /**
   * Persists a batch of already-normalized transactions for a user.
   * Exposed so that controller endpoints can opt-in to persistence after fetching,
   * without the fetch functions themselves calling process() directly.
   *
   * Returns null when the array is empty (nothing to persist).
   */
  async persistNormalizedTransactions(
    userId: string,
    normalizedTransactions: NormalizedTransaction[],
  ): Promise<any> {
    if (!normalizedTransactions || normalizedTransactions.length === 0) {
      return null;
    }
    return this.processingService.process(userId, normalizedTransactions);
  }

  /**
   * Fetches all bank account transactions, saves to legacy DB + new processing pipeline.
   * Moves orchestration that was previously in the controller into the service.
   */
  async getAndSaveBankTransactions(
    firebaseId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    this.logger.log(`[DIAG] BANK_START | firebaseId=${firebaseId?.substring(0, 8)}... | dateFrom=${dateFrom} | dateTo=${dateTo}`);

    // Step 1: Get all accounts
    let accountsResponse;
    try {
      accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true });
      const accountCount = accountsResponse?.accounts?.length ?? 0;
      this.logger.log(`[DIAG] BANK_ACCOUNTS_FETCHED | count=${accountCount} | firebaseId=${firebaseId?.substring(0, 8)}...`);
    } catch (error: any) {
      this.logger.error(`[DIAG] BANK_ACCOUNTS_FETCH_FAILED | firebaseId=${firebaseId?.substring(0, 8)}... | status=${error?.status ?? 'unknown'} | error=${error?.message}`, error?.stack);
      if (error?.status === 404 || error?.code === 'ACCOUNTS_NOT_FOUND') {
        return {
          transactions: [],
          accountsProcessed: 0,
          accountsFailed: 1,
          totalTransactions: 0,
          transactionsByAccount: {},
          normalizedTransactions: [],
          error: 'CONSENT_REQUIRED',
          message: 'User accounts not found. Please complete the Feezback consent flow first.',
        };
      }
      throw error;
    }

    const accounts = accountsResponse?.accounts || [];
    if (!accounts || accounts.length === 0) {
      this.logger.log(`[DIAG] BANK_ACCOUNTS_EMPTY — no accounts returned, skipping transaction fetch | firebaseId=${firebaseId?.substring(0, 8)}...`);
      return {
        transactions: [],
        accountsProcessed: 0,
        accountsFailed: 0,
        totalTransactions: 0,
        transactionsByAccount: {},
        normalizedTransactions: [],
      };
    }

    // Step 2: Fetch transactions per account
    const allTransactions: any[] = [];
    const accountTransactionsMap: { [accountName: string]: any[] } = {};
    const delayBetweenRequests = 5000;
    let accountsFailed = 0;

    // cooldown after GET /accounts before first accountTransactions request
    // await this.sleep(1500);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      if (i > 0) {
        // await this.sleep(delayBetweenRequests);
      }

      try {
        const transactionsResponse = await this.feezbackApiService.getAccountTransactions(
          sub,
          account._links.transactions.href,
          bookingStatus,
          dateFrom,
          dateTo,
        );

        const transactions = this.extractBankTransactions(transactionsResponse);

        this.logger.log(
          `[DIAG] BANK_ACCOUNT_FETCH | account=${account.name} | index=${i + 1}/${accounts.length} | extracted=${transactions.length}`,
        );

        if (transactions.length > 0) {
          accountTransactionsMap[account.name] = transactions;
          allTransactions.push(...transactions);
        } else {
          accountTransactionsMap[account.name] = [];
        }
      } catch (error: any) {
        this.logger.error(
          `[DIAG] BANK_ACCOUNT_FAILED | account=${account.name} | index=${i + 1}/${accounts.length} | error=${error.message}`,
          error.stack,
        );
        accountsFailed++;
      }
    }

    const bankAccountsSucceeded = Object.keys(accountTransactionsMap).length;
    this.logger.log(
      `[DIAG] BANK_EXTRACTION_TOTAL | accounts_attempted=${accounts.length} | accounts_succeeded=${bankAccountsSucceeded} | accounts_failed=${accounts.length - bankAccountsSucceeded} | total_extracted=${allTransactions.length}`,
    );

    // Build account info/mapping for legacy save + normalization
    const accountInfoMap: { [accountName: string]: any } = {};
    (accountsResponse?.accounts || []).forEach((acc: any) => {
      accountInfoMap[acc.name] = acc;
    });

    const transactionToAccountMap: { [transactionId: string]: string } = {};
    Object.keys(accountTransactionsMap).forEach(accountName => {
      (accountTransactionsMap[accountName] || []).forEach((tx: any) => {
        if (tx.transactionId) {
          transactionToAccountMap[tx.transactionId] = accountName;
        }
      });
    });

    // Save to file for inspection
    let savedFilePaths: { raw: string | null; simplified: string | null } = { raw: null, simplified: null };
    if (allTransactions.length > 0) {
      savedFilePaths = this.saveTransactionsToFile(firebaseId, allTransactions, accountTransactionsMap, accountInfoMap);
    }

    const response: any = {
      transactions: allTransactions,
      accountsProcessed: Object.keys(accountTransactionsMap).length,
      accountsFailed,
      totalTransactions: allTransactions.length,
      transactionsByAccount: accountTransactionsMap,
      savedFilePaths,
    };

    if (allTransactions.length === 0) {
      response.normalizedTransactions = [];
      response.databaseSaveResult = { saved: 0, skipped: 0, message: 'No transactions to save' };
      response.syncSummary = {
        bank: { banksProcessed: response.accountsProcessed, transactionsFetched: 0 },
        card: { cardsProcessed: 0, transactionsFetched: 0 },
        system: { totalProcessed: 0, savedInCurrentImport: 0, alreadyExisting: 0 },
      };
      return response;
    }

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    try {
      this.logger.log(`[DIAG] BANK_NORMALIZE_START | input=${allTransactions.length} | firebaseId=${firebaseId?.substring(0, 8)}...`);
      const normalized = this.normalizeBankTransactions(
        allTransactions,
        accountInfoMap,
        transactionToAccountMap,
      );
      response.normalizedTransactions = normalized;
      this.logger.log(`[DIAG] BANK_NORMALIZE_DONE | normalized=${normalized.length} | firebaseId=${firebaseId?.substring(0, 8)}...`);
    } catch (error: any) {
      this.logger.error(`[DIAG] BANK_NORMALIZE_FAILED | firebaseId=${firebaseId?.substring(0, 8)}... | error=${error.message}`, error.stack);
      response.processingError = error.message;
      response.normalizedTransactions = [];
    }

    const bankNormalizedCount = (response.normalizedTransactions as NormalizedTransaction[]).length;
    response.syncSummary = {
      bank: {
        banksProcessed: response.accountsProcessed,
        transactionsFetched: bankNormalizedCount,
      },
      card: { cardsProcessed: 0, transactionsFetched: 0 },
      system: {
        totalProcessed: bankNormalizedCount,
        savedInCurrentImport: 0,
        alreadyExisting: 0,
      },
    };

    // cooldown after BANK flow completes before GET /cards begins
    // await this.sleep(2000);

    return response;
  }

  // ---------------------------------------------------------------------------
  // Normalization: raw Feezback data → NormalizedTransaction[]
  // ---------------------------------------------------------------------------

  private normalizeBankTransactions(
    transactions: any[],
    accountInfoMap: { [accountName: string]: any },
    transactionToAccountMap: { [transactionId: string]: string },
  ): NormalizedTransaction[] {
    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;

    for (const tx of transactions) {
      const externalId = tx?.transactionId;
      if (!externalId || typeof externalId !== 'string' || externalId.trim() === '') {
        droppedMissingId++;
        continue;
      }

      const transactionDate = this.parseTxDate(tx, 'BANK');
      if (!transactionDate) { droppedInvalidDate++; continue; }

      const amount = this.parseTxAmount(tx, 'BANK');
      if (amount === null) { droppedInvalidAmount++; continue; }

      const accountName = transactionToAccountMap[externalId] || null;
      const accountInfo = accountName ? accountInfoMap[accountName] : null;

      // .slice(-7) matches the format stored in Source.sourceName for bank accounts.
      // TransactionProcessingService.buildBillMap() looks up paymentIdentifier
      // against source.sourceName, so the format must be identical.
      const fullIdentifier = this.resolveBankPaymentIdentifier(tx, accountInfo);

      result.push({
        externalTransactionId: externalId,
        merchantName: this.resolveBankMerchantName(tx),
        amount,
        transactionDate,
        paymentDate: this.parseDateCandidate(tx?.valueDate),
        paymentIdentifier: fullIdentifier.slice(-7),
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.remittanceInformationUnstructured || tx?.additionalInformation || null,
      });
    }

    const uniqueIds = new Set(result.map(r => r.externalTransactionId));
    this.logger.log(
      `[DIAG] BANK_NORMALIZATION | input=${transactions.length} | output=${result.length} | unique_ids=${uniqueIds.size} | dropped_missing_id=${droppedMissingId} | dropped_invalid_date=${droppedInvalidDate} | dropped_invalid_amount=${droppedInvalidAmount}`,
    );

    return result;
  }

  private normalizeCardTransactions(
    transactions: any[],
    cardInfoMap: Record<string, any>,
  ): NormalizedTransaction[] {
    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;

    for (const tx of transactions) {
      const externalId = this.extractCardExternalId(tx);
      if (!externalId) { droppedMissingId++; continue; }

      const transactionDate = this.parseTxDate(tx, 'CARD');
      if (!transactionDate) { droppedInvalidDate++; continue; }

      const amount = this.parseTxAmount(tx, 'CARD');
      if (amount === null) { droppedInvalidAmount++; continue; }

      const cardMeta = tx?.__cardMeta || null;
      const cardInfo = cardMeta?.cardResourceId ? cardInfoMap[cardMeta.cardResourceId] : null;
      const { identifier: paymentIdentifier } = this.resolveCardPaymentIdentifier(tx, cardMeta, cardInfo);

      result.push({
        externalTransactionId: externalId,
        merchantName: this.resolveCardMerchantName(tx),
        amount,
        transactionDate,
        paymentDate: null,
        paymentIdentifier,
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.transactionDetails || null,
      });
    }

    const uniqueIds = new Set(result.map(r => r.externalTransactionId));
    this.logger.log(
      `[DIAG] CARD_NORMALIZATION | input=${transactions.length} | output=${result.length} | unique_ids=${uniqueIds.size} | dropped_missing_id=${droppedMissingId} | dropped_invalid_date=${droppedInvalidDate} | dropped_invalid_amount=${droppedInvalidAmount}`,
    );

    return result;
  }

  /**
   * Extracts bank transactions from various Feezback response formats.
   */
  private extractBankTransactions(response: any): any[] {
    if (!response) return [];

    if (Array.isArray(response)) return response;

    if (response?.transactions) {
      if (Array.isArray(response.transactions)) return response.transactions;
      if (Array.isArray(response.transactions?.booked)) return response.transactions.booked;
      if (Array.isArray(response.transactions?.pending)) return response.transactions.pending;
    }

    if (Array.isArray(response?.data?.transactions)) return response.data.transactions;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.booked)) return response.booked;

    // Fallback: find first array property
    for (const key in response) {
      if (Array.isArray(response[key])) return response[key];
    }

    return [];
  }

  private extractCardTransactions(response: any): any[] {
    // console.log("transactionssssssssssss: ", JSON.stringify(response, null, 2));
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


  private parseTxDate(tx: any, source: 'BANK' | 'CARD'): Date | null {
    const candidates = source === 'CARD'
      ? [tx?.transactionDate, tx?.acceptorTransactionDateTime, tx?.bookingDate, tx?.valueDate]
      : [tx?.bookingDate, tx?.valueDate];

    for (const candidate of candidates) {
      const parsed = this.parseDateCandidate(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private parseDateCandidate(value: any): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseTxAmount(tx: any, source: 'BANK' | 'CARD'): number | null {
    const amountInfo = source === 'CARD'
      ? this.resolveCardAmount(tx)
      : { amount: this.parseNumericAmount(tx?.transactionAmount?.amount) };

    if (amountInfo.amount === null) {
      return null;
    }

    if (source === 'CARD') {
      return -amountInfo.amount;
    }

    return amountInfo.amount;
  }

  private resolveCardAmount(tx: any): { amount: number | null; currency: string | null } {
    const txAmount = this.parseNumericAmount(tx?.transactionAmount?.amount);
    const originalAmount = this.parseNumericAmount(tx?.originalAmount?.amount);

    const chosenAmount = (txAmount === null || txAmount === 0) && originalAmount && originalAmount !== 0
      ? originalAmount
      : txAmount;

    const currency = tx?.transactionAmount?.currency
      || tx?.originalAmount?.currency
      || null;

    return {
      amount: chosenAmount,
      currency,
    };
  }

  private parseNumericAmount(value: any): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    const parsed = parseFloat(value.toString().replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }

  private resolveBankPaymentIdentifier(tx: any, accountInfo: any): string {
    const accountReference = this.extractBankAccountReference(tx, accountInfo);
    if (accountReference) {
      return accountReference;
    }

    if (tx?.entryReference) {
      return tx.entryReference;
    }

    const txId = tx?.transactionId || '';
    return `feezback-${txId.substring(0, 8)}`;
  }

  private extractBankAccountReference(tx: any, accountInfo: any): string | null {
    const candidates = [
      // tx?.accountReference,
      // tx?.accountId,
      // tx?.creditorAccount?.iban,
      // tx?.debtorAccount?.iban,
      // tx?.creditorAccount?.maskedPan,
      // tx?.debtorAccount?.maskedPan,
      accountInfo?.iban,
      accountInfo?.maskedPan,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    return null;
  }

  private resolveCardPaymentIdentifier(
    tx: any,
    cardMeta?: any,
    cardInfo?: any,
  ): { identifier: string | null; warning: string | null } {
    type Candidate = { value: any; source: string };

    const candidates: Candidate[] = [
      { value: cardMeta?.maskedPan, source: 'meta.maskedPan' },
      { value: cardInfo?.maskedPan, source: 'cardInfo.maskedPan' },
      { value: tx?.cardAccount?.maskedPan, source: 'tx.cardAccount.maskedPan' },
      { value: tx?.cardDetails?.maskedPan, source: 'tx.cardDetails.maskedPan' },
      { value: tx?.account?.maskedPan, source: 'tx.account.maskedPan' },
      { value: tx?.maskedPan, source: 'tx.maskedPan' },
    ];

    let chosenLast4: string | null = null;
    let chosenSource: string | null = null;

    for (const candidate of candidates) {
      if (!candidate.value) {
        continue;
      }

      const last4 = this.extractCardLast4(candidate.value);
      if (!last4) {
        continue;
      }

      if (!chosenLast4) {
        chosenLast4 = last4;
        chosenSource = candidate.source;
        continue;
      }

      if (chosenLast4 !== last4) {
        return {
          identifier: null,
          warning: `Conflicting card identifiers (${chosenSource}=${chosenLast4} vs ${candidate.source}=${last4})`,
        };
      }
    }

    if (!chosenLast4) {
      return {
        identifier: null,
        warning: 'No masked PAN available to derive card identifier',
      };
    }

    return {
      identifier: chosenLast4,
      warning: null,
    };
  }

  private extractCardLast4(value: any): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.match(/(\d{4})$/);
    return match ? match[1] : null;
  }

  private resolveCardMerchantName(tx: any): string {
    const candidates = [
      tx?.cardAcceptorId,
      tx?.cardAcceptorName,
      tx?.transactionDetails,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    return 'לא זוהה בית עסק';
  }

  private resolveBankMerchantName(tx: any): string {
    const candidates = [
      tx?.creditorName,
      tx?.debtorName,
      tx?.remittanceInformationUnstructured,
      tx?.additionalInformation,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    return 'לא זוהה בית עסק';
  }

  // ---------------------------------------------------------------------------
  // Full-sync orchestration (shared by login and webhook)
  // ---------------------------------------------------------------------------

  private readonly runningFullSyncByUser = new Map<string, Promise<void>>();

  /**
   * Entry point for the two-pull Feezback full-sync flow.
   * Safe to call concurrently from login, webhook, and manual triggers: a per-user
   * in-flight guard returns the existing promise if a sync is already running for that user.
   */
  async triggerFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook' | 'manual'): Promise<void> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');

    // Log #1 — requested
    this.logger.log(`[FullSync] Requested | triggeredBy=${triggeredBy} | firebaseId=${masked}`);

    // In-flight guard — reuse existing promise if sync is already running
    const existing = this.runningFullSyncByUser.get(firebaseId);
    if (existing) {
      // Log #2 — reused
      this.logger.log(`[FullSync] Skipped — already running, reusing in-flight promise | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
      return existing;
    }

    // Log #3 — starting
    this.logger.log(`[FullSync] Starting | triggeredBy=${triggeredBy} | firebaseId=${masked}`);

    // Capture sync state BEFORE markQuickRunning overwrites it so doFullSync can
    // correctly determine whether the cache was empty at the time sync was triggered.
    const preSyncState = await this.userSyncStateService.getSyncState(firebaseId).catch(err => {
      this.logger.error(`[FullSync] Failed to read pre-sync state | firebaseId=${masked} | error=${err?.message}`, err?.stack);
      return null;
    });

    // Persist quick-sync start so the frontend can begin polling immediately.
    await this.userSyncStateService.markQuickRunning(firebaseId, triggeredBy).catch(err => {
      this.logger.error(`[FullSync] Failed to write running state | firebaseId=${masked} | error=${err?.message}`, err?.stack);
    });

    const promise = this.doFullSync(firebaseId, triggeredBy, masked, preSyncState).finally(() => {
      this.runningFullSyncByUser.delete(firebaseId);
      this.logger.debug(`[FullSync] In-flight map cleanup done | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
    });

    this.runningFullSyncByUser.set(firebaseId, promise);
    return promise;
  }

  /**
   * Evaluates the outcome quality of a single sync phase (Quick or Full) from
   * the raw results returned by getAndSaveBankTransactions and getAndSaveUserCardTransactions.
   *
   * Returns the backend-facing resultStatus only. The frontend-facing processStatus
   * is determined by the orchestration layer (doFullSync) after persistence, so
   * that it can account for normalizedTransactions.length cleanly.
   *
   * resultStatus values:
   *   'success'         — no errors at any level; safe to persist
   *   'partial_success' — errors occurred but some normalized data exists; do NOT persist
   *   'failed'          — errors occurred and no normalized data was produced; do NOT persist
   *
   * CONSENT_REQUIRED is explicitly treated as a bank error (→ failed if no card data).
   * This method has no side effects and does not touch the DB.
   */
  private computePhaseStatus(
    bankRes: any,
    cardRes: any,
  ): {
    resultStatus: 'success' | 'partial_success' | 'failed';
    normalizedTransactions: NormalizedTransaction[];
    hasErrors: boolean;
    diagnostics: {
      errors: string[];
      bankAccountsProcessed: number;
      bankAccountsFailed: number;
      cardsFailed: number;
      cardsSucceeded: number;
      bankNormalized: number;
      cardNormalized: number;
    };
  } {
    const errors: string[] = [];

    // ── Bank error signals ─────────────────────────────────────────────────────
    if (bankRes === null) {
      errors.push('bank_fetch_failed');
    } else {
      if (bankRes?.error === 'CONSENT_REQUIRED') {
        // No bank accounts connected — treat as a bank-level failure.
        errors.push('bank_consent_required');
      }
      if ((bankRes?.accountsFailed ?? 0) > 0) {
        errors.push(`bank_accounts_failed:${bankRes.accountsFailed}`);
      }
      if (bankRes?.processingError) {
        errors.push(`bank_normalize_error:${bankRes.processingError}`);
      }
    }

    // ── Card error signals ─────────────────────────────────────────────────────
    if (cardRes === null) {
      errors.push('card_fetch_failed');
    } else {
      if ((cardRes?.cardErrors?.length ?? 0) > 0) {
        errors.push(`card_errors:${cardRes.cardErrors.length}`);
      }
      if (cardRes?.processingError) {
        errors.push(`card_normalize_error:${cardRes.processingError}`);
      }
    }

    const hasErrors = errors.length > 0;

    const normalizedTransactions: NormalizedTransaction[] = [
      ...((bankRes?.normalizedTransactions as NormalizedTransaction[]) ?? []),
      ...((cardRes?.normalizedTransactions as NormalizedTransaction[]) ?? []),
    ];

    let resultStatus: 'success' | 'partial_success' | 'failed';
    if (!hasErrors) {
      resultStatus = 'success';
    } else if (normalizedTransactions.length > 0) {
      resultStatus = 'partial_success';
    } else {
      resultStatus = 'failed';
    }

    return {
      resultStatus,
      normalizedTransactions,
      hasErrors,
      diagnostics: {
        errors,
        bankAccountsProcessed: bankRes?.accountsProcessed ?? 0,
        bankAccountsFailed: bankRes?.accountsFailed ?? 0,
        cardsFailed: cardRes?.cardErrors?.length ?? 0,
        cardsSucceeded: cardRes?.cardsSucceeded ?? 0,
        bankNormalized: ((bankRes?.normalizedTransactions as NormalizedTransaction[]) ?? []).length,
        cardNormalized: ((cardRes?.normalizedTransactions as NormalizedTransaction[]) ?? []).length,
      },
    };
  }

  private async doFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook' | 'manual', masked: string, preSyncState?: UserSyncState | null): Promise<void> {
    try {
      // Gate — only proceed for users who have OPEN_BANKING module access.
      const user = await this.userRepository.findOne({ where: { firebaseId }, select: ['modulesAccess'] });
      if (!user?.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
        console.log(`\n⛔ [FullSync] SKIPPED — reason: OPEN_BANKING module not enabled | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
        this.logger.log(`[FullSync] Skipped — OPEN_BANKING not in modulesAccess | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'no_access').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(no_access) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }

      // Log #4 gate — use the pre-markQuickRunning state captured in triggerFullSync so we see
      // the true state before 'running' was written (avoids false "not empty" reads).
      const syncState = preSyncState !== undefined ? preSyncState : await this.userSyncStateService.getSyncState(firebaseId);
      const syncIsEmpty = !syncState ||
        syncState.quickProcessStatus === 'empty' ||
        syncState.fullProcessStatus === 'empty';
      if (!syncIsEmpty) {
        console.log(`\n⛔ [FullSync] SKIPPED — reason: sync state is not empty (${syncState?.quickProcessStatus}/${syncState?.fullProcessStatus}) | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
        this.logger.log(`[FullSync] Skipped — sync state is not empty | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'cache_exists').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(cache_exists) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }
      console.log(`\n🚀 [FullSync] RUNNING — sync state is empty, starting sync | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
      this.logger.log(`[FullSync] Sync state empty — proceeding with sync | triggeredBy=${triggeredBy} | firebaseId=${masked}`);

      const sub = `${firebaseId}_sub`;
      const today = new Date();
      const fmt = (d: Date): string => d.toISOString().split('T')[0];

      const pull1From = fmt(new Date(today.getFullYear(), today.getMonth() - 2, 1));
      const pull1To   = fmt(today);
      const pull2From = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));

      // ── Quick sync (Pull 1): current month + previous 2 full calendar months ────
      // Log #5
      this.logger.log(`[FullSync] QuickSync start | triggeredBy=${triggeredBy} | firebaseId=${masked} | dateFrom=${pull1From} | dateTo=${pull1To}`);

      const [bankRes1, cardRes1] = await Promise.all([
        (async () => {
          this.logger.log(`[FullSync] QuickSync bank fetch started | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          const r = await this.getAndSaveBankTransactions(firebaseId, sub, 'booked', pull1From, pull1To);
          this.logger.log(`[FullSync] QuickSync bank fetch completed | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          return r;
        })().catch(e => {
          // Log #6
          this.logger.error(`[FullSync] QuickSync bank failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${e?.message ?? e}`, e?.stack);
          return null;
        }),
        (async () => {
          this.logger.log(`[FullSync] QuickSync card fetch started | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          const r = await this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull1From, pull1To);
          this.logger.log(`[FullSync] QuickSync card fetch completed | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          return r;
        })().catch(e => {
          // Log #7
          this.logger.error(`[FullSync] QuickSync card failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${e?.message ?? e}`, e?.stack);
          return null;
        }),
      ]);

      const quickPhase = this.computePhaseStatus(bankRes1, cardRes1);
      let quickRowsWritten = 0;
      let quickProcessStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

      if (!quickPhase.hasErrors) {
        if (quickPhase.normalizedTransactions.length > 0) {
          this.logger.log(`[FullSync] QuickSync persisting | firebaseId=${masked} | normalized=${quickPhase.normalizedTransactions.length}`);
          const pr = await this.processingService.process(firebaseId, quickPhase.normalizedTransactions);
          quickRowsWritten = pr.newlySavedToCache;
          this.logger.log(`[FullSync] QuickSync persist done | firebaseId=${masked} | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}`);
          quickProcessStatus = 'completed';
        } else {
          this.logger.log(`[FullSync] QuickSync completed — no transactions in date range | firebaseId=${masked}`);
          quickProcessStatus = 'completed';
        }
      } else {
        this.logger.warn(`[FullSync] QuickSync NOT persisted | resultStatus=${quickPhase.resultStatus} | firebaseId=${masked} | errors=${JSON.stringify(quickPhase.diagnostics.errors)}`);
        quickProcessStatus = 'failed';
      }

      this.logger.log(`[FullSync] QuickSync done | triggeredBy=${triggeredBy} | firebaseId=${masked} | processStatus=${quickProcessStatus} | resultStatus=${quickPhase.resultStatus} | rowsWritten=${quickRowsWritten} | diagnostics=${JSON.stringify(quickPhase.diagnostics)}`);

      await this.userSyncStateService.markQuickFinished(
        firebaseId,
        quickProcessStatus,
        quickPhase.resultStatus,
        quickRowsWritten,
        quickPhase.hasErrors ? quickPhase.diagnostics.errors.join(', ') : undefined,
      ).catch(err => {
        this.logger.error(`[FullSync] Failed to write quickFinished state | firebaseId=${masked} | error=${err?.message}`);
      });

      // ── Gate: do not run Pull 2 if quick sync failed ─────────────────────────
      if (quickProcessStatus === 'failed') {
        this.logger.warn(`[FullSync] Skipping full sync — quick sync failed | firebaseId=${masked}`);
        await this.userSyncStateService.markFullFinished(
          firebaseId,
          'failed',
          'failed',
          0,
          'Not run: quick sync failed',
        ).catch(err => {
          this.logger.error(`[FullSync] Failed to write fullFinished(skipped-due-to-quick-fail) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }

      // ── Full sync (Pull 2): up to 12-month backfill ──────────────────────────
      // Log #9
      this.logger.log(`[FullSync] FullSync start | triggeredBy=${triggeredBy} | firebaseId=${masked} | dateFrom=${pull2From} | dateTo=${pull1To}`);

      await this.userSyncStateService.markFullRunning(firebaseId).catch(err => {
        this.logger.error(`[FullSync] Failed to write fullRunning state | firebaseId=${masked} | error=${err?.message}`);
      });

      const [bankRes2, cardRes2] = await Promise.all([
        (async () => {
          this.logger.log(`[FullSync] FullSync bank fetch started | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          const r = await this.getAndSaveBankTransactions(firebaseId, sub, 'booked', pull2From, pull1To);
          this.logger.log(`[FullSync] FullSync bank fetch completed | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          return r;
        })().catch(e => {
          // Log #10
          this.logger.error(`[FullSync] FullSync bank failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${e?.message ?? e}`, e?.stack);
          return null;
        }),
        (async () => {
          this.logger.log(`[FullSync] FullSync card fetch started | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          const r = await this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull2From, pull1To);
          this.logger.log(`[FullSync] FullSync card fetch completed | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
          return r;
        })().catch(e => {
          // Log #11
          this.logger.error(`[FullSync] FullSync card failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${e?.message ?? e}`, e?.stack);
          return null;
        }),
      ]);

      const fullPhase = this.computePhaseStatus(bankRes2, cardRes2);
      let fullRowsWritten = 0;
      let fullProcessStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

      if (!fullPhase.hasErrors) {
        if (fullPhase.normalizedTransactions.length > 0) {
          this.logger.log(`[FullSync] FullSync persisting | firebaseId=${masked} | normalized=${fullPhase.normalizedTransactions.length}`);
          const pr = await this.processingService.process(firebaseId, fullPhase.normalizedTransactions);
          fullRowsWritten = pr.newlySavedToCache;
          this.logger.log(`[FullSync] FullSync persist done | firebaseId=${masked} | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}`);
          fullProcessStatus = 'completed';
        } else {
          this.logger.log(`[FullSync] FullSync completed — no transactions in date range | firebaseId=${masked}`);
          fullProcessStatus = 'completed';
        }
      } else {
        this.logger.warn(`[FullSync] FullSync NOT persisted | resultStatus=${fullPhase.resultStatus} | firebaseId=${masked} | errors=${JSON.stringify(fullPhase.diagnostics.errors)}`);
        fullProcessStatus = 'failed';
      }

      this.logger.log(`[FullSync] FullSync done | triggeredBy=${triggeredBy} | firebaseId=${masked} | processStatus=${fullProcessStatus} | resultStatus=${fullPhase.resultStatus} | rowsWritten=${fullRowsWritten} | diagnostics=${JSON.stringify(fullPhase.diagnostics)}`);

      const overallSuccess = quickProcessStatus === 'completed' && fullProcessStatus === 'completed';
      console.log(`\n${overallSuccess ? '✅' : '⚠️'} [FullSync] COMPLETE | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
      console.log(`   Quick: ${quickProcessStatus} (${quickRowsWritten} rows saved)`);
      console.log(`   Full:  ${fullProcessStatus} (${fullRowsWritten} rows saved)\n`);

      await this.userSyncStateService.markFullFinished(
        firebaseId,
        fullProcessStatus,
        fullPhase.resultStatus,
        fullRowsWritten,
        fullPhase.hasErrors ? fullPhase.diagnostics.errors.join(', ') : undefined,
      ).catch(err => {
        this.logger.error(`[FullSync] Failed to write fullFinished state | firebaseId=${masked} | error=${err?.message}`);
      });

    } catch (err: any) {
      console.error(`\n❌ [FullSync] FAILED | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${err?.message ?? err}\n`);
      this.logger.error(`[FullSync] Failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${err?.message ?? err}`, err?.stack);
      await this.userSyncStateService.markBothFailed(firebaseId, err?.message ?? 'UNKNOWN_ERROR').catch(writeErr => {
        this.logger.error(`[FullSync] Failed to write failed state | firebaseId=${masked} | error=${writeErr?.message}`);
      });
    }
  }

}
