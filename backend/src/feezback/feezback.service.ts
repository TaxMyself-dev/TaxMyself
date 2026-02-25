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
import * as fs from 'fs';
import * as path from 'path';
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
    // this.logger.log(`Saving ${transactions.length} bank transactions to database for user: ${userId}`);

    const externalIds = transactions
      .map(tx => tx?.transactionId)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');

    const existingSet = await this.buildExistingTransactionSet(userId, externalIds);

    const transactionsToSave: Transactions[] = [];
    let skippedCount = 0;

    for (const tx of transactions) {
      const externalId = tx?.transactionId;

      if (!externalId || typeof externalId !== 'string' || externalId.trim() === '') {
        // this.logger.warn('Skipping bank transaction without transactionId');
        skippedCount++;
        continue;
      }

      if (existingSet.has(externalId)) {
        // this.logger.debug(`Bank transaction with finsiteId ${externalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const transaction = this.buildBaseTransactionEntity(tx, userId, 'BANK');
      if (!transaction) {
        skippedCount++;
        continue;
      }

      const accountName = transactionToAccountMap[externalId] || null;
      const accountInfo = accountName ? accountInfoMap[accountName] : null;

      transaction.finsiteId = externalId;
      transaction.paymentIdentifier = this.resolveBankPaymentIdentifier(tx, accountInfo).slice(-6);

      transactionsToSave.push(transaction);
    }

    return this.persistTransactions(transactionsToSave, skippedCount);
  }

  async saveCardTransactionsToDatabase(
    transactions: any[],
    userId: string,
    cardInfoMap: { [cardId: string]: any } = {},
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
        // this.logger.warn('Skipping card transaction without external identifier');
        skippedCount++;
        continue;
      }

      if (existingSet.has(externalId)) {
        // this.logger.debug(`Card transaction with finsiteId ${externalId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      const transaction = this.buildBaseTransactionEntity(tx, userId, 'CARD');
      if (!transaction) {
        skippedCount++;
        continue;
      }

      const cardMeta = tx?.__cardMeta || null;
      const cardInfo = cardMeta?.cardResourceId ? cardInfoMap[cardMeta.cardResourceId] : null;
      const { identifier: paymentIdentifier, warning: paymentWarning } = this.resolveCardPaymentIdentifier(tx, cardMeta, cardInfo);

      if (paymentWarning) {
        const warnId = tx?.cardTransactionId || externalId;
        this.logger.warn(`Card transaction ${warnId}: ${paymentWarning}`);
      }

      transaction.finsiteId = externalId;
      transaction.paymentIdentifier = paymentIdentifier;

      const logPayload = {
        cardTransactionId: tx?.cardTransactionId || null,
        transactionAmount: tx?.transactionAmount?.amount ?? null,
        originalAmount: tx?.originalAmount?.amount ?? null,
        metaMaskedPan: cardMeta?.maskedPan ?? null,
        txMaskedPan: tx?.maskedPan ?? null,
        chosenAmount: transaction.sum,
        chosenPaymentIdentifier: transaction.paymentIdentifier ?? null,
      };
      this.logger.debug(`Card transaction persistence: ${JSON.stringify(logPayload)}`);

      transactionsToSave.push(transaction);
    }

    return this.persistTransactions(transactionsToSave, skippedCount);
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
    const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
      withBalances: true,
      withInvalid: true,
      preventUpdate: false,
    });

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
    const pacingMs = 500;

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
          `Skipping card due to error. card=${cardId} consent=${consentId} status=${status} message=${message}`,
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
    this.logger.log(`Saved raw/simplified card transactions files: ${JSON.stringify(savedFilePaths)}`);

    // ✅ שמירה ל-DB (בלי __cardMeta)
    const saveResult = await this.saveCardTransactionsToDatabase(
      allTransactionsForDb,
      userId,
      cardInfoMap,
    );

    return {
      asOf: new Date().toISOString(),
      bookingStatus,
      dateFrom,
      dateTo,

      cardsProcessed: filteredCards.length,
      cardsSucceeded: cardsResult.length,
      cardsFailed: cardErrors.length,

      savedFilePaths,
      saveResult,
      cards: cardsResult,
      cardErrors,
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
      this.logger.warn(`Card sync already running for ${key}. Reusing in-flight promise.`);
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

  private buildBaseTransactionEntity(tx: any, userId: string, source: 'BANK' | 'CARD'): Transactions | null {
    // console.log("🚀 ~ FeezbackService ~ buildBaseTransactionEntity ~ txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:", tx)
    const transaction = new Transactions();

    transaction.userId = userId;
    transaction.name = source === 'CARD'
      ? this.resolveCardMerchantName(tx)
      : this.resolveBankMerchantName(tx);
    // transaction.name = tx?.remittanceInformationUnstructured
    //   || tx?._aggregate?.standardName
    //   || tx?.description
    //   || 'Unknown Transaction';

    const billDate = this.parseTxDate(tx, source);
    if (!billDate) {
      // this.logger.warn('Skipping transaction without valid date');
      return null;
    }
    transaction.billDate = billDate;

    const amount = this.parseTxAmount(tx, source);
    if (amount === null) {
      // this.logger.warn('Skipping transaction with invalid amount');
      return null;
    }
    transaction.sum = amount;

    transaction.note2 = source === 'CARD'
      ? tx?.transactionDetails || null
      : tx?.remittanceInformationUnstructured || tx?.additionalInformation || null;
    // transaction.category = tx?._aggregate?.category || null;

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
      tx?.accountReference,
      tx?.accountId,
      tx?.creditorAccount?.iban,
      tx?.debtorAccount?.iban,
      tx?.creditorAccount?.maskedPan,
      tx?.debtorAccount?.maskedPan,
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
