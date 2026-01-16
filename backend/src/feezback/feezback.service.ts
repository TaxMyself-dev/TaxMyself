import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom, timeout } from 'rxjs';
import axios from 'axios';
import { FeezbackJwtService } from './feezback-jwt.service';
import { Transactions } from '../transactions/transactions.entity';

@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  private readonly lgsUrl: string;
  private readonly tokenUrl: string;
  private readonly tppApiUrl: string;
  private readonly tppId: string = 'KNCAXnwXk1';

  constructor(
    private readonly http: HttpService,
    private readonly feezbackJwtService: FeezbackJwtService,
    @InjectRepository(Transactions)
    private readonly transactionsRepo: Repository<Transactions>,
  ) {

    this.lgsUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback/link';
    // For production: use 'https://lgs-prod.feezback.cloud/token' and 'https://prod-tpp.feezback.cloud'
    this.tokenUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback/token';
    this.tppApiUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback';
    // this.logger.log(`Feezback LGS URL: ${this.lgsUrl}`);
    // this.logger.log(`Feezback Token URL: ${this.tokenUrl}`);
    // this.logger.log(`Feezback TPP API URL: ${this.tppApiUrl}`);

  }

  async createConsentLink(firebaseId: string) {
    try {
      const token = await this.feezbackJwtService.generateConsentJwt(firebaseId);
      // console.log("firebaseId: ", firebaseId);
      // console.log("token: ", token);

      // this.logger.debug(`Sending token to Feezback LGS URL: ${this.lgsUrl}`);

      const response$ = this.http.post(this.lgsUrl, { token });
      const { data } = await firstValueFrom(response$);

      this.logger.debug(`Feezback response: ${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      this.logger.error(
        `Error calling Feezback LGS: ${error?.message}`,
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

  /**
   * Gets an access token from Feezback for accessing user data
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @returns Access token string
   */
  async getAccessToken(sub: string): Promise<string> {
    try {
      // Generate JWT token for accessing user data
      const jwtToken = this.feezbackJwtService.generateAccessToken(sub);
      // console.log("jwtToken: ", jwtToken);

      // this.logger.debug(`Requesting access token from: ${this.tokenUrl}`);

      // Request access token from Feezback
      const response = await axios.post(this.tokenUrl, { token: jwtToken });
      const data = response.data;

      // this.logger.debug(`Access token response: ${JSON.stringify(data)}`);

      // Extract token from response
      const accessToken = data?.token;
      
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Invalid access token response format');
      }

      return accessToken;
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

  /**
   * Gets user accounts data from Feezback
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @returns User accounts data
   */
  async getUserAccounts(sub: string): Promise<any> {
    try {
      this.logger.log(`Getting user accounts for sub: ${sub}`);
      
      // Get access token first
      const accessToken = await this.getAccessToken(sub);
      // this.logger.log(`Access token received (length: ${accessToken})`);
      
      // Build the user identifier with TPP ID
      // Format: {sub}@TPP_ID (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub@KNCAXnwXk1")
      const userIdentifier = `${sub}@${this.tppId}`;
      // Note: The @ symbol in the path should work without encoding in axios
      // If 404 occurs, it's likely because the user hasn't completed consent flow
      const accountsUrl = `${this.tppApiUrl}/tpp/v1/users/${userIdentifier}/accounts`;

      this.logger.log(`Requesting accounts from URL: ${accountsUrl}`);
      this.logger.log(`User identifier: ${userIdentifier}`);

      // Request user accounts with timeout
      // this.logger.debug(`Making GET request to: ${accountsUrl}`);
      // this.logger.debug(`Authorization header: Bearer ${accessToken.substring(0, 20)}...`);
      
      const response = await axios.get(accountsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        timeout: 60000, // 60 seconds timeout (configured in axios)
      });
      
      this.logger.debug(`Waiting for response...`);
      const data = response.data;

      // Log only relevant account info instead of full response
      if (data?.accounts && Array.isArray(data.accounts)) {
        const accountSummary = data.accounts.map((acc: any) => ({
          name: acc.name,
          iban: acc.iban,
          maskedPan: acc.maskedPan,
          cashAccountType: acc.cashAccountType,
        }));
        this.logger.debug(`User accounts: ${JSON.stringify(accountSummary)}`);
      } else {
        this.logger.debug(`User accounts response structure: ${Object.keys(data || {}).join(', ')}`);
      }
      
      // Transform the response to extract name, links, and account identifiers
      if (data?.accounts && Array.isArray(data.accounts)) {
        const transformedAccounts = data.accounts.map((account: any) => ({
          name: account.name,
          iban: account.iban || null,
          maskedPan: account.maskedPan || null,
          cashAccountType: account.cashAccountType || null, // CACC for bank, CARD for credit card
          ownerName: account.ownerName || null,
          currency: account.currency || null,
          balancesLink: account._links?.balances?.href 
            ? `${this.tppApiUrl}${account._links.balances.href}` 
            : null,
          transactionsLink: account._links?.transactions?.href 
            ? `${this.tppApiUrl}${account._links.transactions.href}` 
            : null,
        }));
        
        return {
          accounts: transformedAccounts,
        };
      }
      
      return data;
    } catch (error: any) {
      // Handle 404 specifically - user might not have completed consent
      if (error?.response?.status === 404) {
        this.logger.warn(
          `User accounts not found (404) for sub: ${sub}. This usually means the user hasn't completed the consent flow yet.`,
        );
        
        if (error?.response?.data) {
          this.logger.warn(
            `Feezback 404 response: ${JSON.stringify(error.response.data)}`,
          );
        }
        
        // Return a user-friendly error
        const friendlyError = new Error(
          'User accounts not found. Please complete the Feezback consent flow first.'
        );
        (friendlyError as any).status = 404;
        (friendlyError as any).code = 'ACCOUNTS_NOT_FOUND';
        throw friendlyError;
      }

      this.logger.error(
        `Error getting user accounts: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      // Preserve status code
      if (error?.response?.status) {
        (error as any).status = error.response.status;
      }

      throw error;
    }
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
    try {
      this.logger.log(`Getting transactions for sub: ${sub}`);
      this.logger.log(`Transactions link: ${transactionsLink}`);
      
      // Get access token first
      const accessToken = await this.getAccessToken(sub);
      // this.logger.log(`Access token received (length: ${accessToken.length})`);

      // Add a small delay after getting access token to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

      // Build URL with query parameters
      const url = new URL(transactionsLink);
      url.searchParams.set('bookingStatus', bookingStatus);
      
      // Set date parameters as per Feezback API documentation
      if (dateFrom && dateFrom.trim() !== '') {
        url.searchParams.set('dateFrom', dateFrom);
      }
      
      if (dateTo && dateTo.trim() !== '') {
        url.searchParams.set('dateTo', dateTo);
      }

      // this.logger.debug(`Making GET request to: ${url.toString()}`);
      // this.logger.debug(`Authorization header: Bearer ${accessToken.substring(0, 20)}...`);
      
      const response = await axios.get(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        timeout: 60000, // 60 seconds timeout
      });
      
      const data = response.data;

      // Log only relevant summary instead of full response
      if (Array.isArray(data)) {
        this.logger.debug(`Received ${data.length} transactions (array)`);
      } else if (data?.transactions && Array.isArray(data.transactions)) {
        this.logger.debug(`Received ${data.transactions.length} transactions in 'transactions' field`);
      } else if (data?.booked && Array.isArray(data.booked)) {
        this.logger.debug(`Received ${data.booked.length} transactions in 'booked' field`);
      } else if (data?.data?.transactions && Array.isArray(data.data.transactions)) {
        this.logger.debug(`Received ${data.data.transactions.length} transactions in 'data.transactions' field`);
      } else {
        this.logger.debug(`Response structure: ${Object.keys(data || {}).join(', ')}`);
      }
      
      return data;
    } catch (error: any) {
      // Check if it's a 429 rate limit error
      const isRateLimit = error?.response?.status === 429 || 
                         error?.status === 429 ||
                         error?.message?.includes('429') ||
                         error?.code === 'TOO_MANY_REQUESTS';

      if (isRateLimit) {
        this.logger.warn(
          `Rate limit error getting transactions: ${error?.message}`,
        );
      } else {
        this.logger.error(
          `Error getting transactions: ${error?.message}`,
          error?.stack,
        );
      }

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      // Preserve the error status code for better handling upstream
      if (error?.response?.status) {
        error.status = error.response.status;
      }

      throw error;
    }
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
          this.logger.error(`⚠️ CRITICAL: Transaction missing transactionId! This should not happen. Transaction data: ${JSON.stringify({entryReference: tx.entryReference, bookingDate: tx.bookingDate, amount: tx.transactionAmount?.amount})}`);
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
          const savedTransactions = await this.transactionsRepo.save(transactionsToSave);
          this.logger.log(`✅ Successfully saved ${savedTransactions.length} transactions to database`);
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
