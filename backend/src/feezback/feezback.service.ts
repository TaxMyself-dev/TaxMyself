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


  // async getAndSaveUserCardTransactions(
  //   userId: string,
  //   sub: string,
  //   bookingStatus: string = 'booked',
  //   dateFrom?: string,
  //   dateTo?: string,
  //   cardResourceId?: string,
  // ): Promise<any> {

  //   const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
  //     withBalances: true,
  //     withInvalid: true,
  //     preventUpdate: false,
  //   });

  //   const cards = cardsResponse?.cards || [];
  //   const filteredCards = cardResourceId
  //     ? cards.filter(card => card?.resourceId === cardResourceId)
  //     : cards;

  //   const cardInfoMap: { [cardName: string]: any } = {};
  //   const transactionToCardMap: { [externalId: string]: string } = {};
  //   const cardsResult: any[] = [];
  //   const allTransactions: any[] = [];

  //   for (const card of filteredCards) {
  //     const cardId = card?.resourceId;

  //     if (!cardId) {
  //       // this.logger.warn('Skipping card without resourceId');
  //       continue;
  //     }

  //     const consentId = card?.consentId
  //       || card?.relatedConsents?.[0]?.resourceId
  //       || null;

  //     if (!consentId) {
  //       // this.logger.warn(`Skipping card ${cardId} without consentId`);
  //       continue;
  //     }

  //     const cardName = card?.displayName
  //       || card?.name
  //       || card?.maskedPan
  //       || cardId;

  //     cardInfoMap[cardName] = card;

  //     const transactionsResponse = await this.feezbackConsentApiService.getCardTransactions(
  //       sub,
  //       consentId,
  //       cardId,
  //       bookingStatus,
  //       dateFrom,
  //       dateTo,
  //     );
  //     // console.log("🚀 ~ FeezbackService ~ getAndSaveUserCardTransactions ~ transactionsResponse:", transactionsResponse)

  //     const transactions = this.extractCardTransactions(transactionsResponse);

  //     transactions.forEach(tx => {
  //       const externalId = this.extractCardExternalId(tx);
  //       if (externalId) {
  //         transactionToCardMap[externalId] = cardName;
  //       }
  //     });

  //     cardsResult.push({
  //       cardResourceId: cardId,
  //       displayName: cardName,
  //       maskedPan: card?.maskedPan,
  //       consentId,
  //       transactions,
  //     });

  //     allTransactions.push(...transactions);
  //   }

  //   const saveResult = await this.saveCardTransactionsToDatabase(
  //     allTransactions,
  //     userId,
  //     cardInfoMap,
  //     transactionToCardMap,
  //   );

  //   return {
  //     asOf: new Date().toISOString(),
  //     bookingStatus,
  //     dateFrom,
  //     dateTo,
  //     cardsProcessed: cardsResult.length,
  //     saveResult,
  //     cards: cardsResult,
  //   };
  // }

  // FeezbackService

  // FeezbackService

  private readonly runningCardSyncByUser = new Map<string, Promise<any>>();

  // FeezbackService

  // private async getAndSaveUserCardTransactionsInternal(
  //   userId: string,
  //   sub: string,
  //   bookingStatus: string = 'booked',
  //   dateFrom?: string,
  //   dateTo?: string,
  //   cardResourceId?: string,
  // ): Promise<any> {
  //   const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
  //     withBalances: true,
  //     withInvalid: true, // נשאר true כדי שתראה “כרטיסים בעייתיים”, אבל לא נקרוס בגללם
  //     preventUpdate: false,
  //   });

  //   const cards = cardsResponse?.cards || [];
  //   const filteredCards = cardResourceId
  //     ? cards.filter(card => card?.resourceId === cardResourceId)
  //     : cards;

  //   const cardInfoMap: Record<string, any> = {};
  //   const transactionToCardMap: Record<string, string> = {};
  //   const cardsResult: any[] = [];
  //   const allTransactions: any[] = [];

  //   const cardErrors: Array<{
  //     cardResourceId: string;
  //     consentId: string | null;
  //     displayName: string;
  //     status?: number;
  //     code?: string;
  //     message: string;
  //     responseData?: any;
  //   }> = [];

  //   // ✅ PACING (תוכל לכוון)
  //   const pacingMs = 500;

  //   for (let i = 0; i < filteredCards.length; i++) {
  //     const card = filteredCards[i];
  //     const cardId = card?.resourceId;

  //     if (!cardId) {
  //       this.logger.warn('Skipping card without resourceId');
  //       continue;
  //     }

  //     const consentId =
  //       card?.consentId ||
  //       card?.relatedConsents?.[0]?.resourceId ||
  //       null;

  //     const cardName =
  //       card?.displayName ||
  //       card?.name ||
  //       card?.maskedPan ||
  //       cardId;

  //     cardInfoMap[cardName] = card;

  //     // ✅ pacing בין כרטיסים
  //     if (i > 0 && pacingMs > 0) {
  //       await this.sleep(pacingMs);
  //     }

  //     try {
  //       if (!consentId) {
  //         throw Object.assign(new Error('Missing consentId for card'), { status: 400 });
  //       }

  //       const transactionsResponse =
  //         await this.feezbackConsentApiService.getCardTransactions(
  //           sub,
  //           consentId,
  //           cardId,
  //           bookingStatus,
  //           dateFrom,
  //           dateTo,
  //         );

  //       const transactions = this.extractCardTransactions(transactionsResponse);
  //       //save transaction to file for debug

  //       const transactionsByCard: { [cardName: string]: any[] } = {};
  //       transactionsByCard[cardName] = transactions;
  //       const saved = this.saveTransactionsToFile(
  //         userId,
  //         allTransactions,
  //         transactionsByCard, // פה זה בעצם לפי כרטיס
  //         cardInfoMap,        // גם פה: map של כרטיסים במקום accounts
  //       );

  //       this.logger.log(`Saved raw/simplified card transactions files: ${JSON.stringify(saved)}`);
  //       for (const tx of transactions) {
  //         const externalId = this.extractCardExternalId(tx);
  //         if (externalId) transactionToCardMap[externalId] = cardName;
  //       }

  //       cardsResult.push({
  //         cardResourceId: cardId,
  //         displayName: cardName,
  //         maskedPan: card?.maskedPan,
  //         consentId,
  //         transactions,
  //       });

  //       allTransactions.push(...transactions);
  //     } catch (err: any) {
  //       const status = err?.status ?? err?.response?.status;
  //       const code = err?.code;
  //       const message = err?.message || 'Unknown error';

  //       this.logger.warn(
  //         `Skipping card due to error. card=${cardId} consent=${consentId} status=${status} message=${message}`,
  //       );

  //       cardErrors.push({
  //         cardResourceId: cardId,
  //         consentId,
  //         displayName: cardName,
  //         status,
  //         code,
  //         message,
  //         responseData: err?.response?.data
  //           ? (typeof err.response.data === 'string'
  //             ? err.response.data.slice(0, 500)
  //             : err.response.data)
  //           : undefined,
  //       });

  //       continue; // ✅ ממשיכים לכרטיס הבא
  //     }
  //   }

  //   const saveResult = await this.saveCardTransactionsToDatabase(
  //     allTransactions,
  //     userId,
  //     cardInfoMap,
  //     transactionToCardMap,
  //   );

  //   return {
  //     asOf: new Date().toISOString(),
  //     bookingStatus,
  //     dateFrom,
  //     dateTo,

  //     cardsProcessed: filteredCards.length,
  //     cardsSucceeded: cardsResult.length,
  //     cardsFailed: cardErrors.length,

  //     saveResult,
  //     cards: cardsResult,
  //     cardErrors, // ✅ חדש
  //   };
  // }
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
      withInvalid: true,
      preventUpdate: false,
    });
    const cardCount = cardsResponse?.cards?.length ?? 0;
    this.logger.log(`[DIAG] CARD_CARDS_FETCHED | count=${cardCount} | userId=${userId?.substring(0, 8)}...`);

    const cards = cardsResponse?.cards || [];
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
      await this.sleep(1500);
    }

    for (let i = 0; i < filteredCards.length; i++) {
      const card = filteredCards[i];
      const cardId = card?.resourceId;

      if (!cardId) {
        this.logger.warn('Skipping card without resourceId');
        continue;
      }

      // Feezback API schema: card.consentId is the primary consent ID field.
      // card.relatedConsents is an array of plain consent ID strings (e.g. ['aDICmp2p']),
      // NOT an array of objects — so .resourceId would always be undefined and must not be used.
      const consentId: string | null =
        (typeof card?.consentId === 'string' && card.consentId.trim() !== '' ? card.consentId : null) ||
        (typeof card?.relatedConsents?.[0] === 'string' && card.relatedConsents[0].trim() !== ''
          ? card.relatedConsents[0]
          : null);

      this.logger.log(
        `[DIAG] CARD_CONSENT_RESOLVE | cardId=${cardId} | cardName=${card?.displayName ?? card?.maskedPan ?? cardId} | consentId=${consentId ?? 'NULL'} | relatedConsents=${JSON.stringify(card?.relatedConsents ?? null)}`,
      );

      const cardName =
        card?.displayName ||
        card?.name ||
        card?.maskedPan ||
        cardId;

      cardInfoMap[cardId] = card;

      if (i > 0 && pacingMs > 0) {
        await this.sleep(pacingMs);
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

    // New pipeline: normalize → process → persist to full_transactions_cache
    let processingResult: any = null;
    let processingError: string | null = null;
    let databaseSaveResult: { saved: number; skipped: number; message: string } | null = null;
    try {
      this.logger.log(`[DIAG] CARD_NORMALIZE_START | input=${allTransactionsForDb.length} | userId=${userId?.substring(0, 8)}...`);
      const normalized = this.normalizeCardTransactions(allTransactionsForDb, cardInfoMap);
      if (normalized.length > 0) {
        this.logger.log(`[DIAG] CARD_PROCESS_START | normalized=${normalized.length} | userId=${userId?.substring(0, 8)}...`);
        processingResult = await this.processingService.process(userId, normalized);
        this.logger.log(`[DIAG] CARD_PROCESS_DONE | saved=${processingResult.newlySavedToCache} | skipped=${processingResult.alreadyExistingInCache} | total=${processingResult.totalReceived} | userId=${userId?.substring(0, 8)}...`);
        databaseSaveResult = {
          saved: processingResult.newlySavedToCache,
          skipped: processingResult.alreadyExistingInCache,
          message: `Saved ${processingResult.newlySavedToCache} new transactions. ${processingResult.alreadyExistingInCache} already existed.`,
        };
        this.logger.log(`Card pipeline: ${JSON.stringify(processingResult)}`);
      } else {
        this.logger.log(`[DIAG] CARD_NORMALIZE_EMPTY — all transactions dropped during normalization | userId=${userId?.substring(0, 8)}...`);
      }
    } catch (err: any) {
      this.logger.error(`[DIAG] CARD_PIPELINE_FAILED | userId=${userId?.substring(0, 8)}... | error=${err.message}`, err.stack);
      processingError = err.message;
    }

    const cardProcessedCount = processingResult?.totalReceived ?? 0;
    const syncSummary = {
      bank: { banksProcessed: 0, transactionsFetched: 0 },
      card: {
        cardsProcessed: cardsResult.length,
        transactionsFetched: cardProcessedCount,
      },
      system: {
        totalProcessed: cardProcessedCount,
        savedInCurrentImport: processingResult?.newlySavedToCache ?? 0,
        alreadyExisting: processingResult?.alreadyExistingInCache ?? 0,
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
      processingResult,
      processingError,
      cards: cardsResult,
      cardErrors,

      syncSummary,
    };
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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
      accountsResponse = await this.feezbackApiService.getUserAccounts(sub);
      const accountCount = accountsResponse?.accounts?.length ?? 0;
      this.logger.log(`[DIAG] BANK_ACCOUNTS_FETCHED | count=${accountCount} | firebaseId=${firebaseId?.substring(0, 8)}...`);
    } catch (error: any) {
      this.logger.error(`[DIAG] BANK_ACCOUNTS_FETCH_FAILED | firebaseId=${firebaseId?.substring(0, 8)}... | status=${error?.status ?? 'unknown'} | error=${error?.message}`, error?.stack);
      if (error?.status === 404 || error?.code === 'ACCOUNTS_NOT_FOUND') {
        return {
          transactions: [],
          accountsProcessed: 0,
          totalTransactions: 0,
          transactionsByAccount: {},
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
        totalTransactions: 0,
        transactionsByAccount: {},
      };
    }

    // Step 2: Fetch transactions per account
    const allTransactions: any[] = [];
    const accountTransactionsMap: { [accountName: string]: any[] } = {};
    const delayBetweenRequests = 5000;

    // cooldown after GET /accounts before first accountTransactions request
    await this.sleep(1500);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      if (i > 0) {
        await this.sleep(delayBetweenRequests);
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
      totalTransactions: allTransactions.length,
      transactionsByAccount: accountTransactionsMap,
      savedFilePaths,
    };

    if (allTransactions.length === 0) {
      response.databaseSaveResult = { saved: 0, skipped: 0, message: 'No transactions to save' };
      response.syncSummary = {
        bank: { banksProcessed: response.accountsProcessed, transactionsFetched: 0 },
        card: { cardsProcessed: 0, transactionsFetched: 0 },
        system: { totalProcessed: 0, savedInCurrentImport: 0, alreadyExisting: 0 },
      };
      return response;
    }

    // New pipeline: normalize → process → persist to full_transactions_cache
    try {
      this.logger.log(`[DIAG] BANK_NORMALIZE_START | input=${allTransactions.length} | firebaseId=${firebaseId?.substring(0, 8)}...`);
      const normalized = this.normalizeBankTransactions(
        allTransactions,
        accountInfoMap,
        transactionToAccountMap,
      );
      if (normalized.length > 0) {
        this.logger.log(`[DIAG] BANK_PROCESS_START | normalized=${normalized.length} | firebaseId=${firebaseId?.substring(0, 8)}...`);
        const processingResult = await this.processingService.process(firebaseId, normalized);
        this.logger.log(`[DIAG] BANK_PROCESS_DONE | saved=${processingResult.newlySavedToCache} | skipped=${processingResult.alreadyExistingInCache} | total=${processingResult.totalReceived} | firebaseId=${firebaseId?.substring(0, 8)}...`);
        response.processingResult = processingResult;
        response.databaseSaveResult = {
          saved: processingResult.newlySavedToCache,
          skipped: processingResult.alreadyExistingInCache,
          message: `Saved ${processingResult.newlySavedToCache} new transactions. ${processingResult.alreadyExistingInCache} already existed.`,
        };
        this.logger.log(`Bank pipeline: ${JSON.stringify(processingResult)}`);
      } else {
        this.logger.log(`[DIAG] BANK_NORMALIZE_EMPTY — all transactions dropped during normalization | firebaseId=${firebaseId?.substring(0, 8)}...`);
      }
    } catch (error: any) {
      this.logger.error(`[DIAG] BANK_PIPELINE_FAILED | firebaseId=${firebaseId?.substring(0, 8)}... | error=${error.message}`, error.stack);
      response.processingError = error.message;
      response.databaseSaveError = error.message;
    }

    const bankProcessedCount = response.processingResult?.totalReceived ?? 0;
    response.syncSummary = {
      bank: {
        banksProcessed: response.accountsProcessed,
        transactionsFetched: bankProcessedCount,
      },
      card: { cardsProcessed: 0, transactionsFetched: 0 },
      system: {
        totalProcessed: bankProcessedCount,
        savedInCurrentImport: response.processingResult?.newlySavedToCache ?? 0,
        alreadyExisting: response.processingResult?.alreadyExistingInCache ?? 0,
      },
    };

    // cooldown after BANK flow completes before GET /cards begins
    await this.sleep(2000);

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
   * Safe to call concurrently from login and webhook: a per-user in-flight guard
   * returns the existing promise if a sync is already running for that user.
   */
  async triggerFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook'): Promise<void> {
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

    // Persist quick-sync start so the frontend can begin polling immediately.
    await this.userSyncStateService.markQuickRunning(firebaseId, triggeredBy).catch(err => {
      this.logger.error(`[FullSync] Failed to write running state | firebaseId=${masked} | error=${err?.message}`, err?.stack);
    });

    const promise = this.doFullSync(firebaseId, triggeredBy, masked).finally(() => {
      this.runningFullSyncByUser.delete(firebaseId);
      this.logger.debug(`[FullSync] In-flight map cleanup done | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
    });

    this.runningFullSyncByUser.set(firebaseId, promise);
    return promise;
  }

  private async doFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook', masked: string): Promise<void> {
    /** Extracts the count of newly written cache rows from a pull result. */
    const extractRows = (result: any): number => result?.processingResult?.newlySavedToCache ?? 0;

    try {
      // Gate — only proceed for users who have OPEN_BANKING module access.
      const user = await this.userRepository.findOne({ where: { firebaseId }, select: ['modulesAccess'] });
      if (!user?.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
        this.logger.log(`[FullSync] Skipped — OPEN_BANKING not in modulesAccess | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'no_access').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(no_access) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }

      // Log #4 gate — check whether cached transactions already exist
      this.logger.debug(`[FullSync] Checking transaction cache | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
      const hasCached = await this.processingService.hasTransactionCache(firebaseId);
      if (hasCached) {
        this.logger.log(`[FullSync] Skipped — cached transactions already exist | triggeredBy=${triggeredBy} | firebaseId=${masked}`);
        await this.userSyncStateService.markBothSkipped(firebaseId, 'cache_exists').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(cache_exists) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }
      this.logger.log(`[FullSync] Cache empty — proceeding with sync | triggeredBy=${triggeredBy} | firebaseId=${masked}`);

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

      const quickRows = extractRows(bankRes1) + extractRows(cardRes1);
      const quickStatus = quickRows > 0 ? 'completed' : 'completed_empty';
      this.logger.log(`[FullSync] QuickSync done | triggeredBy=${triggeredBy} | firebaseId=${masked} | status=${quickStatus} | rowsWritten=${quickRows}`);

      await this.userSyncStateService.markQuickFinished(firebaseId, quickStatus, quickRows).catch(err => {
        this.logger.error(`[FullSync] Failed to write quickFinished state | firebaseId=${masked} | error=${err?.message}`);
      });

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

      const fullRows = extractRows(bankRes2) + extractRows(cardRes2);
      const fullFinalStatus = fullRows > 0 ? 'completed' : 'completed_empty';
      this.logger.log(`[FullSync] FullSync done | triggeredBy=${triggeredBy} | firebaseId=${masked} | status=${fullFinalStatus} | rowsWritten=${fullRows}`);

      await this.userSyncStateService.markFullFinished(firebaseId, fullFinalStatus, fullRows).catch(err => {
        this.logger.error(`[FullSync] Failed to write fullFinished state | firebaseId=${masked} | error=${err?.message}`);
      });

    } catch (err: any) {
      this.logger.error(`[FullSync] Failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${err?.message ?? err}`, err?.stack);
      await this.userSyncStateService.markBothFailed(firebaseId, err?.message ?? 'UNKNOWN_ERROR').catch(writeErr => {
        this.logger.error(`[FullSync] Failed to write failed state | firebaseId=${masked} | error=${writeErr?.message}`);
      });
    }
  }

}
