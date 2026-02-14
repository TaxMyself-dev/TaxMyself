import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * Saves Feezback transactions to the database
   * @param transactions - Array of Feezback transactions
   * @param userId - User's firebaseId
   * @param accountInfoMap - Map of account names to account info (for paymentIdentifier)
   * @param transactionToAccountMap - Map of transactionId to account name
   * @returns Object with saved and skipped counts
   */
  async saveTransactionsToDatabase(
    transactions: any[],
    userId: string,
    accountInfoMap: { [accountName: string]: any } = {},
    transactionToAccountMap: { [transactionId: string]: string } = {},
  ): Promise<{ saved: number; skipped: number; message: string }> {
    try {
      this.logger.log(`Saving ${transactions.length} transactions to database for user: ${userId}`);

      const transactionsToSave: Transactions[] = [];
      let skippedCount = 0;

      for (const tx of transactions) {
        // Map Feezback transaction to Transactions entity
        const transaction = new Transactions();

        // Required fields
        transaction.userId = userId;
        transaction.name = tx.remittanceInformationUnstructured ||
          tx._aggregate?.standardName ||
          tx.description ||
          'Unknown Transaction';

        // Save transactionId to finsiteId
        // Validate that transactionId exists (it should always be present)
        if (!tx.transactionId || tx.transactionId.trim() === '') {
          this.logger.error(`⚠️ CRITICAL: Transaction missing transactionId! This should not happen. Transaction data: ${JSON.stringify({ entryReference: tx.entryReference, bookingDate: tx.bookingDate, amount: tx.transactionAmount?.amount })}`);
          skippedCount++;
          continue;
        }
        transaction.finsiteId = tx.transactionId;

        // Determine payment identifier based on account type
        // For bank accounts: use IBAN
        // For credit cards: use last 4 digits of card number
        let paymentIdentifier: string | null = null;

        // Check if it's a credit card transaction (category indicates this)
        const isCreditCard = tx._aggregate?.category === 'כרטיסי אשראי';

        if (isCreditCard) {
          // Try to extract last 4 digits from various sources
          // Check if we have account info with maskedPan
          const accountName = transactionToAccountMap[tx.transactionId || ''];
          const accountInfo = accountName ? accountInfoMap[accountName] : null;

          if (accountInfo?.maskedPan) {
            // Extract last 4 digits from maskedPan (e.g., "458039xxxxxx3724" -> "3724")
            const maskedPan = accountInfo.maskedPan;
            const last4Match = maskedPan.match(/(\d{4})$/);
            if (last4Match) {
              paymentIdentifier = last4Match[1];
            }
          }

          // Fallback: try to extract from account name (e.g., "ויזה 3724" or "מאסטרקארד 3572")
          if (!paymentIdentifier && accountInfo?.name) {
            const nameMatch = accountInfo.name.match(/(\d{4})$/);
            if (nameMatch) {
              paymentIdentifier = nameMatch[1];
            }
          }

          // Fallback: try to extract from entryReference if it looks like a card number
          if (!paymentIdentifier && tx.entryReference && /^\d{4}$/.test(tx.entryReference)) {
            paymentIdentifier = tx.entryReference;
          }
        } else {
          // Bank account transaction - use IBAN from account info
          const accountName = transactionToAccountMap[tx.transactionId || ''];
          const accountInfo = accountName ? accountInfoMap[accountName] : null;

          if (accountInfo?.iban) {
            paymentIdentifier = accountInfo.iban;
          }
        }

        // If we still don't have a payment identifier, use a fallback
        if (!paymentIdentifier) {
          paymentIdentifier = tx.entryReference || `feezback-${tx.transactionId?.substring(0, 8) || Date.now()}`;
          this.logger.warn(`Could not determine payment identifier for transaction ${tx.transactionId}, using fallback: ${paymentIdentifier}`);
        }

        transaction.paymentIdentifier = paymentIdentifier;

        // Dates
        try {
          if (tx.bookingDate) {
            transaction.billDate = new Date(tx.bookingDate);
          } else if (tx.valueDate) {
            transaction.billDate = new Date(tx.valueDate);
          } else {
            this.logger.warn(`Transaction ${tx.transactionId} has no date, skipping`);
            skippedCount++;
            continue;
          }
        } catch (error) {
          this.logger.error(`Failed to parse date for transaction ${tx.transactionId}: ${error.message}`);
          skippedCount++;
          continue;
        }

        // Amount - convert string to number
        try {
          const amountStr = tx.transactionAmount?.amount || '0';
          transaction.sum = parseFloat(amountStr.toString().replace(/,/g, ''));
          if (isNaN(transaction.sum)) {
            this.logger.warn(`Invalid amount for transaction ${tx.transactionId}, skipping`);
            skippedCount++;
            continue;
          }
        } catch (error) {
          this.logger.error(`Failed to parse amount for transaction ${tx.transactionId}: ${error.message}`);
          skippedCount++;
          continue;
        }

        // Optional fields
        transaction.note2 = tx.additionalInformation || null;
        transaction.category = tx._aggregate?.category || null;

        // Set default values
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

        // Check for duplicates by finsiteId (transactionId from Feezback)
        // This is the unique identifier from Feezback, so if it exists, the transaction is already saved
        if (transaction.finsiteId) {
          const existingTransaction = await this.transactionsRepo.findOne({
            where: {
              finsiteId: transaction.finsiteId,
              userId: transaction.userId,
            },
          });

          if (existingTransaction) {
            this.logger.debug(`Transaction with finsiteId ${transaction.finsiteId} already exists, skipping`);
            skippedCount++;
            continue;
          }
        } else {
          // Fallback: if no finsiteId, use the old duplicate check logic
          const existingTransaction = await this.transactionsRepo.findOne({
            where: {
              name: transaction.name,
              paymentIdentifier: transaction.paymentIdentifier,
              billDate: transaction.billDate,
              sum: transaction.sum,
              userId: transaction.userId,
            },
          });

          if (existingTransaction) {
            this.logger.debug(`Transaction ${transaction.paymentIdentifier} already exists (no finsiteId), skipping`);
            skippedCount++;
            continue;
          }
        }

        transactionsToSave.push(transaction);
      }

      // Save all transactions in batch
      if (transactionsToSave.length > 0) {
        try {
          this.logger.log(`Attempting to save ${transactionsToSave.length} transactions in batch...`);
          const savedResult = await this.transactionsRepo.save(transactionsToSave);
          const savedCount = Array.isArray(savedResult) ? savedResult.length : (savedResult ? 1 : 0);
          this.logger.log(`✅ Successfully saved ${savedCount} transactions to database`);
        } catch (saveError: any) {
          this.logger.error(`❌ Error during batch save: ${saveError.message}`, saveError.stack);
          throw new Error(`Failed to save transactions to database: ${saveError.message}`);
        }
      } else {
        this.logger.log(`No new transactions to save (all were duplicates or invalid)`);
      }

      return {
        saved: transactionsToSave.length,
        skipped: skippedCount,
        message: `Successfully saved ${transactionsToSave.length} transactions. Skipped ${skippedCount} duplicate or invalid transactions.`,
      };
    } catch (error: any) {
      this.logger.error(`Error saving transactions to database: ${error.message}`, error.stack);
      throw error;
    }
  }
}




// import { HttpService } from '@nestjs/axios';
// import { Injectable, Logger } from '@nestjs/common';
// import { firstValueFrom } from 'rxjs';
// import { FeezbackJwtService } from './feezback-jwt.service';

// @Injectable()
// export class FeezbackService {
//   private readonly logger = new Logger(FeezbackService.name);
//   // private readonly lgsUrl = process.env.FEEZBACK_LGS_URL || 'https://lgs-integ01.feezback.cloud/link';
//   private readonly lgsUrl = process.env.FEEZBACK_LGS_URL;

//   constructor(
//     private readonly http: HttpService,
//     private readonly jwtService: FeezbackJwtService,
//   ) {}

//   async createConsentLink(userId: string, context: string = 'default'): Promise<string> {
//     // 1) יוצרים JWT בעזרת השירות שבנית
//     const token = this.jwtService.generateConsentToken(userId, context);

//     this.logger.debug(`Creating Feezback consent link for userId=${userId}, context=${context}`);

//     // 2) שולחים בקשה ל-Feezback עם ה-token בגוף
//     try {
//       const res = await firstValueFrom(
//         this.http.post(this.lgsUrl, { token })
//       );

//       this.logger.log(`Feezback /link response: ${JSON.stringify(res.data)}`);

//       // ⚠️ כאן לא 100% ידוע איך בדיוק נראה ה-response
//       // אז עושים fallback חכם:
//       const data = res.data;
//       const link = data?.link || data?.url || data?.redirectUrl || data;

//       if (!link || typeof link !== 'string') {
//         this.logger.error(`Unexpected Feezback link response format: ${JSON.stringify(data)}`);
//         throw new Error('Unexpected Feezback response, link not found');
//       }

//       return link;
//     } catch (err) {
//       this.logger.error('Error creating Feezback consent link', err);
//       throw err;
//     }
//   }
// }
