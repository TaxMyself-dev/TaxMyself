import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackJwtService } from './feezback-jwt.service';
import { FeezbackConsent } from './consent/entities/feezback-consent.entity';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { ConsentSyncService } from './consent/consent-sync.service';
import { FeezbackConsentService } from './consent/feezback-consent.service';
import { TransactionProcessingService } from '../transactions/transaction-processing.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { UserSyncState } from '../transactions/user-sync-state.entity';
import { NormalizedTransaction } from '../transactions/interfaces/normalized-transaction.interface';
import { User } from '../users/user.entity';
import { Source } from '../transactions/source.entity';
import { ModuleName, SourceType } from '../enum';
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
    private readonly feezbackConsentService: FeezbackConsentService,
    private readonly processingService: TransactionProcessingService,
    private readonly userSyncStateService: UserSyncStateService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Source) private readonly sourceRepository: Repository<Source>,
  ) {
    this.tppId = this.authService.getTppId();
  }

  /**
   * Ensures all Feezback accounts and cards are saved as Source rows.
   * Same upsert logic as the webhook — safe to call repeatedly.
   */
  async ensureSources(firebaseId: string): Promise<{ created: number; updated: number }> {
    const sub = `${firebaseId}_sub`;
    let created = 0;
    let updated = 0;

    // Bank accounts
    try {
      const accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true });
      for (const account of accountsResponse?.accounts ?? []) {
        const iban: string | undefined = account?.iban;
        if (!iban?.trim()) continue;
        const sourceName = iban.trim().slice(-7);
        const feezbackResourceId: string | null = account?.resourceId ?? null;
        const existing = await this.sourceRepository.findOne({ where: { userId: firebaseId, sourceName } });
        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          existing.sourceType = SourceType.BANK_ACCOUNT;
          await this.sourceRepository.save(existing);
          updated++;
        } else {
          await this.sourceRepository.save(
            this.sourceRepository.create({ userId: firebaseId, sourceName, sourceType: SourceType.BANK_ACCOUNT, feezbackResourceId, bill: null }),
          );
          created++;
        }
      }
    } catch (e: any) {
      this.logger.warn(`[EnsureSources] Bank accounts fetch failed | firebaseId=${firebaseId?.substring(0, 8)}... | ${e?.message}`);
    }

    // Credit cards
    try {
      const cardsResponse = await this.feezbackApiService.getUserCards(sub, { withBalances: false });
      for (const card of cardsResponse?.cards ?? []) {
        const maskedPan: string | undefined = card?.maskedPan;
        const last4Match = typeof maskedPan === 'string' ? maskedPan.match(/(\d{4})$/) : null;
        if (!last4Match) continue;
        const sourceName = last4Match[1];
        const feezbackResourceId: string | null = card?.resourceId ?? null;
        const existing = await this.sourceRepository.findOne({ where: { userId: firebaseId, sourceName } });
        if (existing) {
          existing.feezbackResourceId = feezbackResourceId;
          existing.sourceType = SourceType.CREDIT_CARD;
          await this.sourceRepository.save(existing);
          updated++;
        } else {
          await this.sourceRepository.save(
            this.sourceRepository.create({ userId: firebaseId, sourceName, sourceType: SourceType.CREDIT_CARD, feezbackResourceId, bill: null }),
          );
          created++;
        }
      }
    } catch (e: any) {
      this.logger.warn(`[EnsureSources] Cards fetch failed | firebaseId=${firebaseId?.substring(0, 8)}... | ${e?.message}`);
    }

    this.logger.log(`[EnsureSources] Done | firebaseId=${firebaseId?.substring(0, 8)}... | created=${created} updated=${updated}`);
    return { created, updated };
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
        accountInfoMap: accountInfoMap,
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

          // Raw account objects from Feezback — shows which fields are actually present
          debtorAccount: tx?.debtorAccount || null,
          creditorAccount: tx?.creditorAccount || null,

          // Computed paymentIdentifier preview (what would be saved to DB, last 7 chars)
          paymentIdentifierPreview: (
            tx?.debtorAccount?.iban      ||
            tx?.creditorAccount?.iban    ||
            tx?.debtorAccount?.maskedPan ||
            tx?.creditorAccount?.maskedPan ||
            sourceAccount                 ||
            tx?.entryReference            ||
            null
          )?.slice(-7) ?? null,

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
    const tCard = Date.now();

    const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
      withBalances: true,
      withInvalid: false,
      preventUpdate: true,
    });
    const cards = this.dedupeCardsPreferActive(cardsResponse?.cards);
    // const cards = cardsResponse?.cards || [];
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
          `[CardFetch] Failed | card=${cardName} | consent=${consentId} | status=${status} | error=${message}`,
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


    // ✅ שמירה לקובץ פעם אחת בסוף (עם __cardMeta)
    const savedFilePaths = this.saveTransactionsToFile(
      userId,
      allTransactionsForFile,
      transactionsByCard,
      cardInfoMap,
    );

    // Load valid consent IDs — only card transactions with a valid consentId will be saved.
    const validConsentIds = await this.getValidConsentIds(userId);

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    let normalizedTransactions: NormalizedTransaction[] = [];
    let processingError: string | null = null;
    const databaseSaveResult: { saved: number; skipped: number; message: string } | null = null;
    try {
      normalizedTransactions = this.normalizeCardTransactions(allTransactionsForDb, cardInfoMap, validConsentIds);
    } catch (err: any) {
      this.logger.error(`[CardFetch] Normalize failed | userId=${userId?.substring(0, 8)}... | error=${err.message}`, err.stack);
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

    const result = {
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

    // Fire-and-forget: ensure all cards are persisted as Source rows.
    void this.ensureSources(userId).catch(e =>
      this.logger.warn(`[CardFetch] ensureSources failed | ${e?.message}`),
    );

    return { ...result, __durationMs: Date.now() - tCard };
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
      this.logger.warn(`[CardFetch] Already running for key=${key}, skipping duplicate`);
      return existing;
    }


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
    console.log(`════════════════════════════════════`);
    console.log(`  DB PERSIST`);
    console.log(`  Count: ${normalizedTransactions.length}`);
    console.log(`════════════════════════════════════`);
    const tDb = Date.now();
    const pr = await this.processingService.process(userId, normalizedTransactions);
    console.log(`  ✓ Persist done — ${((Date.now() - tDb) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}\n`);
    return pr;
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
    const tBank = Date.now();

    // Step 1: Get all accounts
    let accountsResponse;
    try {
      accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true });
    } catch (error: any) {
      this.logger.error(`[BankFetch] Accounts fetch failed | firebaseId=${firebaseId?.substring(0, 8)}... | status=${error?.status ?? 'unknown'} | error=${error?.message}`, error?.stack);
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
      // No bank accounts linked yet (card-only user or pending consent) — not an error.
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
    let accountsFailed = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      try {
        const transactionsResponse = await this.feezbackApiService.getAccountTransactions(
          sub,
          account._links.transactions.href,
          bookingStatus,
          dateFrom,
          dateTo,
        );

        const rawTransactions = this.extractBankTransactions(transactionsResponse);

        // Stamp the account's IBAN directly onto each transaction so normalization
        // can read it without relying on the transactionToAccountMap lookup.
        const transactions = rawTransactions.map(tx => ({
          ...tx,
          __accountIban: account.iban ?? null,
        }));


        if (transactions.length > 0) {
          accountTransactionsMap[account.name] = transactions;
          allTransactions.push(...transactions);
        } else {
          accountTransactionsMap[account.name] = [];
        }
      } catch (error: any) {
        this.logger.error(
          `[BankFetch] Account failed | account=${account.name} | error=${error.message}`,
          error.stack,
        );
        accountsFailed++;
      }
    }

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

    // Load valid consent IDs from DB — only transactions with a valid consentId will be saved.
    const validConsentIds = await this.getValidConsentIds(firebaseId);

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    try {
      const normalized = this.normalizeBankTransactions(
        allTransactions,
        accountInfoMap,
        transactionToAccountMap,
        validConsentIds,
      );
      response.normalizedTransactions = normalized;
    } catch (error: any) {
      this.logger.error(`[BankFetch] Normalize failed | firebaseId=${firebaseId?.substring(0, 8)}... | error=${error.message}`, error.stack);
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

    // Fire-and-forget: ensure all bank accounts are persisted as Source rows.
    void this.ensureSources(firebaseId).catch(e =>
      this.logger.warn(`[BankFetch] ensureSources failed | ${e?.message}`),
    );

    return { ...response, __durationMs: Date.now() - tBank };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Returns the set of valid consentIds for a user from the DB. */
  private async getValidConsentIds(firebaseId: string): Promise<Set<string>> {
    const consents = await this.feezbackConsentService.findByFirebaseId(firebaseId);
    const validSet = new Set<string>();
    for (const c of consents) {
      if (c.status === 'valid' && c.consentId) {
        validSet.add(c.consentId);
      }
    }
    return validSet;
  }

  // ---------------------------------------------------------------------------
  // Normalization: raw Feezback data → NormalizedTransaction[]
  // ---------------------------------------------------------------------------

  private normalizeBankTransactions(
    transactions: any[],
    accountInfoMap: { [accountName: string]: any },
    transactionToAccountMap: { [transactionId: string]: string },
    validConsentIds: Set<string>,
  ): NormalizedTransaction[] {
    // Filter to valid consents only — Feezback may return transactions from expired/related consents.
    let droppedInvalidConsentBank = 0;
    const validTxs = transactions.filter(tx => {
      if (!tx?.consentId || !validConsentIds.has(tx.consentId)) {
        droppedInvalidConsentBank++;
        return false;
      }
      return true;
    });
    if (droppedInvalidConsentBank > 0) {
    }

    // Deduplicate by aspspOriginalId — Feezback may return the same physical transaction
    // multiple times with different transactionId values.
    // Keep the entry with the latest referenceTime.
    const deduped = new Map<string, any>();
    for (const tx of validTxs) {
      const key = tx?.aspspOriginalId || tx?.transactionId;
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, tx);
      } else {
        const existingTime = existing.referenceTime ? new Date(existing.referenceTime).getTime() : 0;
        const newTime = tx.referenceTime ? new Date(tx.referenceTime).getTime() : 0;
        if (newTime > existingTime) {
          deduped.set(key, tx);
        }
      }
    }
    const dedupedTransactions = Array.from(deduped.values());

    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;

    for (const tx of dedupedTransactions) {
      // Use aspspOriginalId as the stable key when available — Feezback may return
      // different transactionId values for the same physical transaction across calls
      // (e.g. Quick sync vs Full sync). aspspOriginalId is the bank's own stable ID.
      const externalId = tx?.aspspOriginalId || tx?.transactionId;
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
        currency: tx?.transactionAmount?.currency ?? 'ILS',
        transactionDate,
        paymentDate: this.parseDateCandidate(tx?.valueDate),
        paymentIdentifier: fullIdentifier.slice(-7),
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.remittanceInformationUnstructured || tx?.additionalInformation || null,
      });
    }

    return result;
  }

  private normalizeCardTransactions(
    transactions: any[],
    cardInfoMap: Record<string, any>,
    validConsentIds: Set<string>,
  ): NormalizedTransaction[] {
    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;
    let droppedInvalidConsent = 0;

    for (const tx of transactions) {
      const consentId = tx?.__cardMeta?.consentId;
      if (!consentId || !validConsentIds.has(consentId)) {
        droppedInvalidConsent++;
        continue;
      }

      const externalId = this.extractCardExternalId(tx);
      if (!externalId) { droppedMissingId++; continue; }

      const transactionDate = this.parseTxDate(tx, 'CARD');
      if (!transactionDate) { droppedInvalidDate++; continue; }

      const cardAmountInfo = this.resolveCardAmount(tx);
      if (cardAmountInfo.amount === null) { droppedInvalidAmount++; continue; }
      const amount = -cardAmountInfo.amount;
      const currency = cardAmountInfo.currency ?? 'ILS';

      const cardMeta = tx?.__cardMeta || null;
      const cardInfo = cardMeta?.cardResourceId ? cardInfoMap[cardMeta.cardResourceId] : null;
      const { identifier: paymentIdentifier } = this.resolveCardPaymentIdentifier(tx, cardMeta, cardInfo);

      result.push({
        externalTransactionId: externalId,
        merchantName: this.resolveCardMerchantName(tx),
        amount,
        currency,
        transactionDate,
        paymentDate: null,
        paymentIdentifier,
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.transactionDetails || null,
      });
    }

    if (droppedInvalidConsent > 0) {
      this.logger.warn(`[CardNormalize] Skipped ${droppedInvalidConsent} transactions with invalid/unknown consentId`);
    }

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
    // Prefer aspspOriginalId — the bank's own stable identifier.
    if (tx?.aspspOriginalId && typeof tx.aspspOriginalId === 'string' && tx.aspspOriginalId.trim() !== '') {
      return tx.aspspOriginalId;
    }

    const rawId: string | undefined = tx?.cardTransactionId || tx?.transactionId;
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') return null;

    // Feezback card IDs: feez-{uuid}-{stableNumber}
    // The UUID changes per API call; only the trailing number is stable.
    // e.g. feez-ea279d7a-...-358945402  →  feez-card-358945402
    //      feez-6fd6efba-...-358945402  →  feez-card-358945402  (same tx, different UUID)
    if (rawId.startsWith('feez-')) {
      const match = rawId.match(/-(-?\d+)$/);
      if (match) return `feez-card-${match[1]}`;
    }

    return rawId;
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
    // Prefer the IBAN stamped directly onto the transaction at fetch time.
    // Fall back to accountInfo (indirect map lookup) and maskedPan.
    const candidates = [
      tx?.__accountIban,
      accountInfo?.iban,
      accountInfo?.maskedPan,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    console.error(`[extractBankAccountReference] ❌ No IBAN found for transaction | transactionId=${tx?.transactionId} | aspspOriginalId=${tx?.aspspOriginalId}`);
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
      console.error(`[resolveCardPaymentIdentifier] ❌ No maskedPan found | transactionId=${tx?.transactionId ?? tx?.cardTransactionId} | cardMeta=${JSON.stringify(cardMeta)}`);
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

  /**
   * Pre-mark the sync state as 'running' before source processing begins.
   * Called by the webhook handler immediately upon receiving a UserDataIsAvailable / ConsentStatusChanged
   * event so the frontend polling sees 'running' even while sources are still being resolved.
   */
  async markSyncRunning(firebaseId: string): Promise<void> {
    await this.userSyncStateService.markQuickRunning(firebaseId, 'webhook').catch(err => {
      this.logger.error(`[WebhookPreMark] Failed to pre-mark running | firebaseId=${firebaseId?.substring(0, 8)}... | error=${err?.message}`);
    });
  }

  async triggerFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook' | 'manual'): Promise<void> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');

    // Log #1 — requested
    this.logger.log(`[FullSync] Requested | triggeredBy=${triggeredBy} | firebaseId=${masked}`);

    // Dev-only gate — FEEZBACK_MANUAL_SYNC_ONLY=true disables automatic syncs (login/webhook) in non-production.
    // Admin-panel pulls use getAndSaveBankTransactions directly and are not affected.
    if (process.env.NODE_ENV !== 'production' && process.env.FEEZBACK_MANUAL_SYNC_ONLY === 'true' && triggeredBy !== 'manual') {
      this.logger.log(`[FullSync] Skipped — FEEZBACK_MANUAL_SYNC_ONLY=true (dev only) | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
      return;
    }

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
      const user = await this.userRepository.findOne({ where: { firebaseId }, select: ['modulesAccess', 'fName', 'lName'] });
      if (!user?.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
        this.logger.log(`[FullSync] Skipped — OPEN_BANKING not in modulesAccess | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'no_access').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(no_access) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }

      // Log #4 gate — use the pre-markQuickRunning state captured in triggerFullSync so we see
      // the true state before 'running' was written (avoids false "not empty" reads).
      const syncState = preSyncState !== undefined ? preSyncState : await this.userSyncStateService.getSyncState(firebaseId);
      const BLOCKING_STATUSES = ['completed', 'running'];
      const syncIsEmpty = !syncState ||
        !BLOCKING_STATUSES.includes(syncState.quickProcessStatus as string) ||
        !BLOCKING_STATUSES.includes(syncState.fullProcessStatus as string);
      // Webhook always forces a full sync — user connected a new bank or updated permissions
      if (!syncIsEmpty && triggeredBy !== 'webhook') {
        this.logger.log(`[FullSync] Skipped — sync state is not empty (${syncState?.quickProcessStatus}/${syncState?.fullProcessStatus}) | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'cache_exists').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(cache_exists) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }
      if (!syncIsEmpty && triggeredBy === 'webhook') {
        this.logger.log(`[FullSync] Forcing sync — webhook override | firebaseId=${masked}`);
      }

      const sub = `${firebaseId}_sub`;
      const today = new Date();
      const fmt = (d: Date): string => d.toISOString().split('T')[0];

      const userName = [user?.fName, user?.lName].filter(Boolean).join(' ') || masked;
      const tTotal = Date.now();

      // ── Webhook sync: single full pass (today → 1 year back) ─────────────────
      if (triggeredBy === 'webhook') {
        const webhookFrom = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
        const webhookTo   = fmt(today);

        console.log(`\n════════════════════════════════════`);
        console.log(`  WEBHOOK SYNC`);
        console.log(`  User : ${userName}`);
        console.log(`  Dates: ${webhookFrom} → ${webhookTo}`);
        console.log(`════════════════════════════════════`);
        const tPullW = Date.now();
        const [bankResW, cardResW] = await Promise.all([
          this.getAndSaveBankTransactions(firebaseId, sub, 'booked', webhookFrom, webhookTo)
            .catch(e => { this.logger.error(`[WebhookSync] Bank pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
          this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', webhookFrom, webhookTo, undefined)
            .catch(e => { this.logger.error(`[WebhookSync] Card pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
        ]);
        console.log(`  ✓ Bank — ${((bankResW?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${bankResW?.normalizedTransactions?.length ?? 0}`);
        console.log(`  ✓ Card — ${((cardResW?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${cardResW?.normalizedTransactions?.length ?? 0}`);
        console.log(`  ✓ Total pull — ${((Date.now() - tPullW) / 1000).toFixed(2)}s\n`);

        const webhookPhase = this.computePhaseStatus(bankResW, cardResW);
        let webhookRowsWritten = 0;
        let webhookProcessStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

        if (!webhookPhase.hasErrors) {
          if (webhookPhase.normalizedTransactions.length > 0) {
            console.log(`════════════════════════════════════`);
            console.log(`  WEBHOOK SYNC — Process transactions`);
            console.log(`  Count: ${webhookPhase.normalizedTransactions.length}`);
            console.log(`════════════════════════════════════`);
            const tDbW = Date.now();
            const pr = await this.processingService.process(firebaseId, webhookPhase.normalizedTransactions);
            webhookRowsWritten = pr.newlySavedToCache;
            console.log(`  ✓ Process done — ${((Date.now() - tDbW) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}\n`);
            webhookProcessStatus = 'completed';
          } else {
            console.log(`  ℹ Webhook sync — no transactions in date range\n`);
            webhookProcessStatus = 'completed';
          }
        } else {
          this.logger.warn(`[WebhookSync] Pull had errors — skipping persist | errors=${JSON.stringify(webhookPhase.diagnostics.errors)}`);
          webhookProcessStatus = 'failed';
        }

        console.log(`════════════════════════════════════`);
        console.log(`  WEBHOOK SYNC COMPLETE — ${webhookProcessStatus === 'completed' ? '✅ OK' : '⚠️  ERRORS'}`);
        console.log(`  Saved: ${webhookRowsWritten} | Total: ${((Date.now() - tTotal) / 1000).toFixed(2)}s`);
        console.log(`════════════════════════════════════\n`);

        // Write both quick and full state so frontend polling resolves correctly
        await this.userSyncStateService.markQuickFinished(
          firebaseId, webhookProcessStatus, webhookPhase.resultStatus, webhookRowsWritten,
          webhookPhase.hasErrors ? webhookPhase.diagnostics.errors.join(', ') : undefined,
        ).catch(err => this.logger.error(`[WebhookSync] Failed to write quickFinished state | error=${err?.message}`));
        await this.userSyncStateService.markFullFinished(
          firebaseId, webhookProcessStatus, webhookPhase.resultStatus, 0,
          webhookPhase.hasErrors ? webhookPhase.diagnostics.errors.join(', ') : undefined,
        ).catch(err => this.logger.error(`[WebhookSync] Failed to write fullFinished state | error=${err?.message}`));
        return;
      }

      // ── Quick sync (Pull 1): current month + previous 2 full calendar months ──
      const pull1FromDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const pull1From = fmt(pull1FromDate);
      const pull1To   = fmt(today);
      const pull2From = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
      // One day before pull1From — ensures zero overlap between the two pulls.
      const pull2To   = fmt(new Date(pull1FromDate.getTime() - 24 * 60 * 60 * 1000));

      console.log(`\n════════════════════════════════════`);
      console.log(`  QUICK SYNC`);
      console.log(`  User : ${userName}`);
      console.log(`  Dates: ${pull1From} → ${pull1To}`);
      console.log(`════════════════════════════════════`);
      const tPull1 = Date.now();
      const [bankRes1, cardRes1] = await Promise.all([
        this.getAndSaveBankTransactions(firebaseId, sub, 'booked', pull1From, pull1To)
          .catch(e => { this.logger.error(`[QuickSync] Bank pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
        this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull1From, pull1To, undefined)
          .catch(e => { this.logger.error(`[QuickSync] Card pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
      ]);
      console.log(`  ✓ Bank — ${((bankRes1?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${bankRes1?.normalizedTransactions?.length ?? 0}`);
      console.log(`  ✓ Card — ${((cardRes1?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${cardRes1?.normalizedTransactions?.length ?? 0}`);
      console.log(`  ✓ Total pull — ${((Date.now() - tPull1) / 1000).toFixed(2)}s\n`);

      const quickPhase = this.computePhaseStatus(bankRes1, cardRes1);
      let quickRowsWritten = 0;
      let quickProcessStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

      if (!quickPhase.hasErrors) {
        if (quickPhase.normalizedTransactions.length > 0) {
          console.log(`════════════════════════════════════`);
          console.log(`  QUICK SYNC — Process transactions`);
          console.log(`  Count: ${quickPhase.normalizedTransactions.length}`);
          console.log(`════════════════════════════════════`);
          const tDb1 = Date.now();
          const pr = await this.processingService.process(firebaseId, quickPhase.normalizedTransactions);
          quickRowsWritten = pr.newlySavedToCache;
          console.log(`  ✓ Process done — ${((Date.now() - tDb1) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}\n`);
          quickProcessStatus = 'completed';
        } else {
          console.log(`  ℹ Quick sync — no transactions in date range\n`);
          quickProcessStatus = 'completed';
        }
      } else {
        this.logger.warn(`[QuickSync] Pull had errors — skipping persist | errors=${JSON.stringify(quickPhase.diagnostics.errors)}`);
        quickProcessStatus = 'failed';
      }

      await this.userSyncStateService.markQuickFinished(
        firebaseId,
        quickProcessStatus,
        quickPhase.resultStatus,
        quickRowsWritten,
        quickPhase.hasErrors ? quickPhase.diagnostics.errors.join(', ') : undefined,
      ).catch(err => {
        this.logger.error(`[QuickSync] Failed to write finished state | error=${err?.message}`);
      });

      // ── Gate: do not run Pull 2 if quick sync failed ─────────────────────────
      if (quickProcessStatus === 'failed') {
        this.logger.warn(`[FullSync] Skipping — quick sync failed`);
        await this.userSyncStateService.markFullFinished(firebaseId, 'failed', 'failed', 0, 'Not run: quick sync failed')
          .catch(err => { this.logger.error(`[FullSync] Failed to write fullFinished(skipped) state | error=${err?.message}`); });
        return;
      }

      // ── Full sync (Pull 2): up to 12-month backfill ──────────────────────────
      await this.userSyncStateService.markFullRunning(firebaseId).catch(err => {
        this.logger.error(`[FullSync] Failed to write fullRunning state | error=${err?.message}`);
      });

      console.log(`════════════════════════════════════`);
      console.log(`  FULL SYNC`);
      console.log(`  User : ${userName}`);
      console.log(`  Dates: ${pull2From} → ${pull2To}`);
      console.log(`════════════════════════════════════`);
      const tPull2 = Date.now();
      const [bankRes2, cardRes2] = await Promise.all([
        this.getAndSaveBankTransactions(firebaseId, sub, 'booked', pull2From, pull2To)
          .catch(e => { this.logger.error(`[FullSync] Bank pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
        this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull2From, pull2To, undefined)
          .catch(e => { this.logger.error(`[FullSync] Card pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
      ]);
      console.log(`  ✓ Bank — ${((bankRes2?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${bankRes2?.normalizedTransactions?.length ?? 0}`);
      console.log(`  ✓ Card — ${((cardRes2?.__durationMs ?? 0) / 1000).toFixed(2)}s | normalized=${cardRes2?.normalizedTransactions?.length ?? 0}`);
      console.log(`  ✓ Total pull — ${((Date.now() - tPull2) / 1000).toFixed(2)}s\n`);

      const fullPhase = this.computePhaseStatus(bankRes2, cardRes2);
      let fullRowsWritten = 0;
      let fullProcessStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

      if (!fullPhase.hasErrors) {
        if (fullPhase.normalizedTransactions.length > 0) {
          console.log(`════════════════════════════════════`);
          console.log(`  FULL SYNC — Process transactions`);
          console.log(`  Count: ${fullPhase.normalizedTransactions.length}`);
          console.log(`════════════════════════════════════`);
          const tDb2 = Date.now();
          const pr = await this.processingService.process(firebaseId, fullPhase.normalizedTransactions);
          fullRowsWritten = pr.newlySavedToCache;
          console.log(`  ✓ Process done — ${((Date.now() - tDb2) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}\n`);
          fullProcessStatus = 'completed';
        } else {
          console.log(`  ℹ Full sync — no transactions in date range\n`);
          fullProcessStatus = 'completed';
        }
      } else {
        this.logger.warn(`[FullSync] Pull had errors — skipping persist | errors=${JSON.stringify(fullPhase.diagnostics.errors)}`);
        fullProcessStatus = 'failed';
      }

      const overallSuccess = quickProcessStatus === 'completed' && fullProcessStatus === 'completed';
      console.log(`════════════════════════════════════`);
      console.log(`  SYNC COMPLETE — ${overallSuccess ? '✅ OK' : '⚠️  ERRORS'}`);
      console.log(`  Quick: ${quickProcessStatus} (${quickRowsWritten} saved)`);
      console.log(`  Full : ${fullProcessStatus} (${fullRowsWritten} saved)`);
      console.log(`  Total: ${((Date.now() - tTotal) / 1000).toFixed(2)}s`);
      console.log(`════════════════════════════════════\n`);

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
