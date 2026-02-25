import { Body, Controller, Get, Logger, Post, Query, Req, UseGuards, Res } from '@nestjs/common';
import { FeezbackService } from './feezback.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { UsersService } from '../users/users.service';
import type { Request, Response } from 'express';
import { log } from 'node:console';
import * as fs from 'fs';
import * as path from 'path';
import { FeezbackWebhookRouterService } from './router/feezback-webhook-router.service';

@Controller('feezback')
export class FeezbackController {
  private readonly logger = new Logger(FeezbackController.name);

  constructor(
    private readonly feezbackService: FeezbackService,
    private readonly usersService: UsersService,
    private readonly routerService: FeezbackWebhookRouterService
  ) { }

  @Post('webhook-router')
  handleWebhookRouter(@Req() req: Request, @Res() res: Response): void {
    console.log("webhook-routerrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr");

    // Return 200 immediately (do not block)
    res.status(200).json({ received: true });

    // Fire-and-forget forwarding
    void this.routerService.forward(req).catch((err) => {
      // Should never throw, but just in case
      this.logger.error('Unexpected error in forward()', err?.stack || String(err));
    });
  }

  @Post('consent-link')
  @UseGuards(FirebaseAuthGuard)
  async createConsentLink(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    return this.feezbackService.createConsentLink(firebaseId);
  }


  @Post('debug-token')
  // @UseGuards(FirebaseAuthGuard)
  async debugToken(@Req() req: AuthenticatedRequest) {

    // const firebaseId = req.user?.firebaseId;
    const firebaseId = "AxFm5xBcYlMTV5kb5OAnde5Rbh62"

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const token = await (this.feezbackService as any).feezbackJwtService.generateConsentJwt(
      firebaseId,
    );

    return { token };
  }


  @Post('get-access-token')
  // @UseGuards(FirebaseAuthGuard)
  async getAccessToken(@Req() req: AuthenticatedRequest) {

    // const firebaseId = req.user?.firebaseId;
    const firebaseId = "AxFm5xBcYlMTV5kb5OAnde5Rbh62"

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const token = await (this.feezbackService as any).feezbackJwtService.generateAccessToken(firebaseId);

    return { token };
  }

  /**
   * Get user accounts from Feezback
   * Requires authentication
   */
  @Get('user-accounts')
  @UseGuards(FirebaseAuthGuard)
  async getUserAccounts(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    // Build sub identifier (same format as in consent JWT and webhook)
    // Format: {firebaseId}_sub (without @TPP_ID)
    // The @TPP_ID is added in the URL, not in the JWT sub field
    const sub = `${firebaseId}_sub`;

    this.logger.log(`Fetching accounts for firebaseId: ${firebaseId}, sub: ${sub}`);

    try {
      const accounts = await this.feezbackService.getUserAccounts(sub);
      console.log("accounts: ", accounts);
      return accounts;
    } catch (error: any) {
      this.logger.error(`Failed to fetch user accounts: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch user accounts: ${error.message}`);
    }
  }

  @Get('consents/sync')
  @UseGuards(FirebaseAuthGuard)
  async syncConsents(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const sub = `${firebaseId}_sub`;

    this.logger.log(`Syncing Feezback consents for firebaseId: ${firebaseId}, sub: ${sub}`);

    try {
      const consents = await this.feezbackService.syncUserConsents(firebaseId, sub);
      return { consents };
    } catch (error: any) {
      this.logger.error(`Failed to sync user consents: ${error.message}`, error.stack);
      throw new Error(`Failed to sync user consents: ${error.message}`);
    }
  }


  /**
   * Get transactions for a specific account
   * Requires authentication
   */
  @Get('transactions')
  @UseGuards(FirebaseAuthGuard)
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('transactionsLink') transactionsLink: string,
    @Query('bookingStatus') bookingStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    if (!transactionsLink) {
      throw new Error('Transactions link is required');
    }

    // Build sub identifier (same format as in consent JWT and webhook)
    const sub = `${firebaseId}_sub`;

    // Set default dates: from 1/1/2026 to 3/2/2026 if not provided
    const defaultDateFrom = dateFrom || '2026-01-01';
    const defaultDateTo = dateTo || '2026-03-02'; // Format: YYYY-MM-DD

    this.logger.log(`Fetching transactions for firebaseId: ${firebaseId}, sub: ${sub}`);
    this.logger.log(`Transactions link: ${transactionsLink}`);
    this.logger.log(`Date range: ${defaultDateFrom} to ${defaultDateTo}`);

    try {
      const transactions = await this.feezbackService.getAccountTransactions(
        sub,
        transactionsLink,
        bookingStatus || 'booked',
        defaultDateFrom,
        defaultDateTo,
      );
      return transactions;
    } catch (error: any) {
      this.logger.error(`Failed to fetch transactions: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
  }

  /**
   * Get all transactions for a specific user (admin only)
   * Admin can fetch transactions for any user by providing their firebaseId
   */
  @Get('admin-user-transactions')
  @UseGuards(FirebaseAuthGuard)
  async getAdminUserTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('firebaseId') targetFirebaseId: string,
    @Query('bookingStatus') bookingStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const adminFirebaseId = req.user?.firebaseId;

    if (!adminFirebaseId) {
      throw new Error('Admin authentication required');
    }

    // Check if user is admin
    const isAdmin = await this.usersService.isAdmin(adminFirebaseId);
    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    if (!targetFirebaseId) {
      throw new Error('firebaseId parameter is required');
    }

    const firebaseId = targetFirebaseId;

    // Build sub identifier (same format as in consent JWT and webhook)
    const sub = `${firebaseId}_sub`;

    // Use provided dates or defaults
    const defaultDateFrom = dateFrom && dateFrom.trim() !== '' ? dateFrom : '2026-01-01';
    const defaultDateTo = dateTo && dateTo.trim() !== '' ? dateTo : new Date().toISOString().split('T')[0];

    this.logger.log(`Admin ${adminFirebaseId} fetching transactions for user ${firebaseId}, sub: ${sub}`);
    this.logger.log(`Date range: ${defaultDateFrom} to ${defaultDateTo}`);

    // Reuse the internal helper method
    try {
      const result = await this.getAllUserTransactionsInternal(firebaseId, sub, bookingStatus, defaultDateFrom, defaultDateTo);
      this.logger.log(`✅ Admin transaction fetch completed successfully`);
      return result;
    } catch (error: any) {
      this.logger.error(`❌ Error in getAdminUserTransactions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Internal helper method to fetch transactions for a user
   */
  private async getAllUserTransactionsInternal(
    firebaseId: string,
    sub: string,
    bookingStatus?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    // Use provided dates or defaults
    const defaultDateFrom = dateFrom && dateFrom.trim() !== '' ? dateFrom : '2026-01-01';
    const defaultDateTo = dateTo && dateTo.trim() !== '' ? dateTo : new Date().toISOString().split('T')[0];

    try {
      // Step 1: Get all accounts
      let accountsResponse;
      try {
        accountsResponse = await this.feezbackService.getUserAccounts(sub);
      } catch (error: any) {
        // Handle 404 - user hasn't completed consent
        if (error?.status === 404 || error?.code === 'ACCOUNTS_NOT_FOUND') {
          this.logger.warn(`User ${firebaseId} has not completed Feezback consent flow`);
          return {
            transactions: [],
            accountsProcessed: 0,
            totalTransactions: 0,
            transactionsByAccount: {},
            error: 'CONSENT_REQUIRED',
            message: 'User accounts not found. Please complete the Feezback consent flow first.',
          };
        }
        // Re-throw other errors
        throw error;
      }

      const accounts = accountsResponse?.accounts || [];

      if (!accounts || accounts.length === 0) {
        return {
          transactions: [],
          accountsProcessed: 0,
          totalTransactions: 0,
          transactionsByAccount: {},
        };
      }

      this.logger.log(`Found ${accounts.length} accounts, fetching transactions...`);

      // Step 2: Fetch transactions for each account with delay to avoid rate limiting
      const allTransactions: any[] = [];
      const accountTransactionsMap: { [accountName: string]: any[] } = {};
      const delayBetweenRequests = 5000; // 5 seconds delay between requests

      // Helper function to add delay
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        console.log("🚀 ~ FeezbackController ~ getAllUserTransactionsInternal ~ account:", account)

        // Add delay before each request (except the first one)
        if (i > 0) {
          this.logger.debug(`Waiting ${delayBetweenRequests}ms before next request to avoid rate limiting...`);
          await delay(delayBetweenRequests);
        }

        try {
          this.logger.log(`Fetching transactions for account: ${account.name} (${i + 1}/${accounts.length})`);
          const transactionsResponse = await this.feezbackService.getAccountTransactions(
            sub,
            account._links.transactions.href,
            // account.transactionsLink,
            bookingStatus || 'booked',
            defaultDateFrom,
            defaultDateTo,
          );

          // Extract transactions from response
          let transactions: any[] = [];

          // Debug: Log response structure
          this.logger.debug(`Response type: ${Array.isArray(transactionsResponse) ? 'Array' : typeof transactionsResponse}`);
          if (!Array.isArray(transactionsResponse) && transactionsResponse) {
            const keys = Object.keys(transactionsResponse);
            this.logger.debug(`Response keys: ${keys.join(', ')}`);

            // Check if transactions key exists and its type
            if ('transactions' in transactionsResponse) {
              const txValue = transactionsResponse.transactions;
              this.logger.debug(`transactions field exists! Type: ${Array.isArray(txValue) ? 'Array' : typeof txValue}, isArray: ${Array.isArray(txValue)}, length: ${Array.isArray(txValue) ? txValue.length : 'N/A'}, value preview: ${JSON.stringify(txValue).substring(0, 200)}`);
            } else {
              this.logger.debug(`transactions key NOT found in response`);
            }
          }

          if (Array.isArray(transactionsResponse)) {
            transactions = transactionsResponse;
            this.logger.debug(`Extracted transactions from array response: ${transactions.length}`);
          } else if ('transactions' in transactionsResponse && transactionsResponse.transactions !== undefined && transactionsResponse.transactions !== null) {
            if (Array.isArray(transactionsResponse.transactions)) {
              transactions = transactionsResponse.transactions;
              this.logger.debug(`✅ Extracted ${transactions.length} transactions from 'transactions' field`);
            } else if (transactionsResponse.transactions?.booked && Array.isArray(transactionsResponse.transactions.booked)) {
              // transactions is an object with a 'booked' array
              transactions = transactionsResponse.transactions.booked;
              this.logger.debug(`✅ Extracted ${transactions.length} transactions from 'transactions.booked' field`);
            } else if (transactionsResponse.transactions?.pending && Array.isArray(transactionsResponse.transactions.pending)) {
              // Also check for pending transactions
              transactions = transactionsResponse.transactions.pending;
              this.logger.debug(`✅ Extracted ${transactions.length} transactions from 'transactions.pending' field`);
            } else {
              this.logger.warn(`⚠️ transactions field exists but is not an array and doesn't have booked/pending. Type: ${typeof transactionsResponse.transactions}, keys: ${Object.keys(transactionsResponse.transactions || {}).join(', ')}`);
            }
          } else if (transactionsResponse?.data?.transactions) {
            if (Array.isArray(transactionsResponse.data.transactions)) {
              transactions = transactionsResponse.data.transactions;
              this.logger.debug(`Extracted transactions from 'data.transactions' field: ${transactions.length}`);
            }
          } else if (transactionsResponse?.data && Array.isArray(transactionsResponse.data)) {
            transactions = transactionsResponse.data;
            this.logger.debug(`Extracted transactions from 'data' array: ${transactions.length}`);
          } else if (transactionsResponse?.booked) {
            if (Array.isArray(transactionsResponse.booked)) {
              transactions = transactionsResponse.booked;
              this.logger.debug(`Extracted transactions from 'booked' field: ${transactions.length}`);
            }
          } else {
            // Try to find any array property
            for (const key in transactionsResponse) {
              if (Array.isArray(transactionsResponse[key])) {
                transactions = transactionsResponse[key];
                this.logger.debug(`Found transactions array in key: ${key}, length: ${transactions.length}`);
                break;
              }
            }
          }

          if (transactions.length > 0) {
            accountTransactionsMap[account.name] = transactions;
            allTransactions.push(...transactions);
            // Log only relevant fields of first transaction as sample
            if (transactions[0]) {
              const sample = {
                transactionId: transactions[0].transactionId,
                bookingDate: transactions[0].bookingDate,
                amount: transactions[0].transactionAmount?.amount,
                currency: transactions[0].transactionAmount?.currency,
                description: transactions[0].remittanceInformationUnstructured || transactions[0].description,
              };
              this.logger.log(`✅ Fetched ${transactions.length} transactions for account: ${account.name} (sample: ${JSON.stringify(sample)})`);
            } else {
              this.logger.log(`✅ Fetched ${transactions.length} transactions for account: ${account.name}`);
            }
          } else {
            this.logger.warn(`⚠️ No transactions found for account: ${account.name}. Response structure: ${JSON.stringify(Object.keys(transactionsResponse || {}))}`);
            accountTransactionsMap[account.name] = [];
          }
        } catch (error: any) {
          // Handle 429 errors with retry logic
          if (error.response?.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            this.logger.warn(`Rate limit hit for account ${account.name}, implementing retry logic...`);

            let retryCount = 0;
            const maxRetries = 3;
            const retryDelays = [10000, 20000, 30000]; // 10s, 20s, 30s

            while (retryCount < maxRetries) {
              await delay(retryDelays[retryCount]);
              retryCount++;

              try {
                this.logger.log(`Retry ${retryCount} for account ${account.name}...`);
                const retryResponse = await this.feezbackService.getAccountTransactions(
                  sub,
                  account._links.transactions.href,
                  // account.transactionsLink,
                  bookingStatus || 'booked',
                  defaultDateFrom,
                  defaultDateTo,
                );

                let retryTransactions: any[] = [];
                if (Array.isArray(retryResponse)) {
                  retryTransactions = retryResponse;
                } else if (retryResponse?.transactions) {
                  if (Array.isArray(retryResponse.transactions)) {
                    retryTransactions = retryResponse.transactions;
                  } else if (retryResponse.transactions?.booked && Array.isArray(retryResponse.transactions.booked)) {
                    retryTransactions = retryResponse.transactions.booked;
                  } else if (retryResponse.transactions?.pending && Array.isArray(retryResponse.transactions.pending)) {
                    retryTransactions = retryResponse.transactions.pending;
                  }
                } else if (retryResponse?.booked) {
                  retryTransactions = Array.isArray(retryResponse.booked) ? retryResponse.booked : [];
                }

                if (retryTransactions.length > 0) {
                  accountTransactionsMap[account.name] = retryTransactions;
                  allTransactions.push(...retryTransactions);
                  this.logger.log(`✅ Retry ${retryCount} succeeded: Fetched ${retryTransactions.length} transactions for account: ${account.name}`);
                  break;
                }
              } catch (retryError: any) {
                if (retryCount === maxRetries) {
                  this.logger.error(`Failed after ${maxRetries} retries for account ${account.name}: ${retryError.message}`);
                } else {
                  this.logger.warn(`Retry ${retryCount} failed for account ${account.name}: ${retryError.message}`);
                }
              }
            }
          } else {
            this.logger.error(`Failed to fetch transactions for account ${account.name}: ${error.message}`, error.stack);
          }
        }
      }

      // Get account information for mapping transactions to source accounts
      const accountsInfo = accountsResponse?.accounts || [];
      const accountInfoMap: { [accountName: string]: any } = {};
      accountsInfo.forEach((acc: any) => {
        accountInfoMap[acc.name] = acc;
      });

      // Create a map to find which account each transaction belongs to
      const transactionToAccountMap: { [transactionId: string]: string } = {};
      Object.keys(accountTransactionsMap).forEach(accountName => {
        const accountTxs = accountTransactionsMap[accountName] || [];
        accountTxs.forEach((tx: any) => {
          const txId = tx.transactionId;
          if (txId) {
            transactionToAccountMap[txId] = accountName;
          }
        });
      });

      // Save transactions to file for inspection
      let savedFilePaths: { raw: string | null; simplified: string | null } = { raw: null, simplified: null };
      this.logger.log(`Total transactions collected: ${allTransactions.length}`);
      if (allTransactions.length > 0) {
        this.logger.log(`Attempting to save ${allTransactions.length} transactions to files...`);
        savedFilePaths = this.saveTransactionsToFile(firebaseId, allTransactions, accountTransactionsMap, accountInfoMap);
        if (savedFilePaths.raw || savedFilePaths.simplified) {
          if (savedFilePaths.raw) {
            this.logger.log(`✅ Raw file saved: ${savedFilePaths.raw}`);
          }
          if (savedFilePaths.simplified) {
            this.logger.log(`✅ Simplified file saved: ${savedFilePaths.simplified}`);
          }
        } else {
          this.logger.warn(`⚠️ File saving returned null - check logs above for errors`);
        }

        // Save transactions to database
        this.logger.log(`Attempting to save ${allTransactions.length} transactions to database...`);
        let saveResult: any = null;
        let dbError: any = null;

        try {
          saveResult = await this.feezbackService.saveBankTransactionsToDatabase(
            allTransactions,
            firebaseId,
            accountInfoMap,
            transactionToAccountMap,
          );
          this.logger.log(`✅ Database save result: ${JSON.stringify(saveResult)}`);
        } catch (error: any) {
          dbError = error;
          this.logger.error(`❌ Failed to save transactions to database: ${error.message}`, error.stack);
          if (error?.response) {
            this.logger.error(`Database error response: ${JSON.stringify(error.response)}`);
          }
        }

        // Always return response, even if database save failed
        const response = {
          transactions: allTransactions,
          accountsProcessed: Object.keys(accountTransactionsMap).length,
          totalTransactions: allTransactions.length,
          transactionsByAccount: accountTransactionsMap,
          savedFilePaths: savedFilePaths,
        };

        if (saveResult) {
          (response as any).databaseSaveResult = saveResult;
        } else if (dbError) {
          (response as any).databaseSaveError = dbError.message || 'Unknown database error';
        } else {
          (response as any).databaseSaveResult = { saved: 0, skipped: 0, message: 'Database save was not attempted' };
        }

        this.logger.log(`Returning response with ${allTransactions.length} transactions`);
        return response;
      } else {
        this.logger.warn(`⚠️ No transactions to save - allTransactions array is empty`);
        return {
          transactions: [],
          accountsProcessed: 0,
          totalTransactions: 0,
          transactionsByAccount: {},
          savedFilePaths: { raw: null, simplified: null },
          databaseSaveResult: { saved: 0, skipped: 0, message: 'No transactions to save' },
        };
      }
    } catch (error: any) {
      this.logger.error(`Error fetching user transactions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all transactions for all user accounts
   * Fetches all accounts first, then gets transactions for each account
   * Requires authentication
   */
  @Get('user-transactions')
  @UseGuards(FirebaseAuthGuard)
  async getAllUserTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('bookingStatus') bookingStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    // Build sub identifier (same format as in consent JWT and webhook)
    const sub = `${firebaseId}_sub`;

    // Set default dates: from 1/1/2026 to today if not provided
    const today = new Date();
    const defaultDateFrom = dateFrom || '2026-01-01';
    const defaultDateTo = dateTo || today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    this.logger.log(`Fetching all transactions for firebaseId: ${firebaseId}, sub: ${sub}`);
    this.logger.log(`Date range: ${defaultDateFrom} to ${defaultDateTo}`);

    return this.getAllUserTransactionsInternal(firebaseId, sub, bookingStatus, defaultDateFrom, defaultDateTo);
  }

  @Get('user-card-transactions')
  @UseGuards(FirebaseAuthGuard)
  async getUserCardTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('bookingStatus') bookingStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('cardResourceId') cardResourceId?: string,
  ) {
    const firebaseId = req.user?.firebaseId;
    console.log('in user-card-transactions');

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const sub = `${firebaseId}_sub`;

    const today = new Date();
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    const resolvedDateTo = dateTo && dateTo.trim() !== '' ? dateTo : formatDate(today);
    const resolvedDateFrom = dateFrom && dateFrom.trim() !== '' ? dateFrom : formatDate(sixtyDaysAgo);

    this.logger.log(`Fetching card transactions for firebaseId: ${firebaseId}, sub: ${sub}`);
    this.logger.log(`Date range: ${resolvedDateFrom} to ${resolvedDateTo}`);

    // Client does not pass consentId; backend resolves consentId via /users/{userId}/cards.
    return this.feezbackService.getAndSaveUserCardTransactions(
      firebaseId,
      sub,
      bookingStatus ?? 'booked',
      resolvedDateFrom,
      resolvedDateTo,
      cardResourceId,
    );
  }

  /**
   * Save transactions to JSON files for inspection
   * Creates two files: raw response and simplified transactions
   * @returns File paths if successful, null if failed
   */
  private saveTransactionsToFile(
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

      this.logger.log(`Attempting to save transactions to: ${outputDir}`);
      this.logger.log(`Current working directory: ${baseDir}`);

      // Create directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        this.logger.log(`Creating directory: ${outputDir}`);
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
        this.logger.log(`✅ Raw transactions saved to: ${rawFilePath}`);
        this.logger.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
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
          category: tx._aggregate?.category || null,
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
              category: tx._aggregate?.category || null,
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
        this.logger.log(`✅ Simplified transactions saved to: ${simplifiedFilePath}`);
        this.logger.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
        result.simplified = simplifiedFilePath;
      }

      return result;
    } catch (error: any) {
      this.logger.error(`❌ Failed to save transactions to file: ${error.message}`, error.stack);
      this.logger.error(`   Error code: ${error.code}`);
      this.logger.error(`   Error path: ${error.path}`);
      return result;
    }
  }

  /**
   * Analyze transaction structure and return field mapping
   * This endpoint helps understand what fields are available in transactions
   */
  @Get('analyze-transactions-structure')
  @UseGuards(FirebaseAuthGuard)
  async analyzeTransactionsStructure(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const sub = `${firebaseId}_sub`;

    try {
      // Get accounts first
      const accountsResponse = await this.feezbackService.getUserAccounts(sub);
      const accounts = accountsResponse?.accounts || [];

      if (accounts.length === 0) {
        return {
          message: 'No accounts found',
          structure: null,
        };
      }

      // Get transactions from first account only (for structure analysis)
      const firstAccount = accounts[0];
      if (!firstAccount.transactionsLink) {
        return {
          message: 'First account has no transactions link',
          structure: null,
        };
      }

      const today = new Date();
      const dateFrom = '2026-01-01';
      const dateTo = today.toISOString().split('T')[0];

      const transactionsResponse = await this.feezbackService.getAccountTransactions(
        sub,
        firstAccount._links.transactions.href,
        // firstAccount.transactionsLink,
        'booked',
        dateFrom,
        dateTo,
      );

      // Log raw response structure
      this.logger.log(`Raw response type: ${typeof transactionsResponse}`);
      this.logger.log(`Raw response keys: ${Object.keys(transactionsResponse || {}).join(', ')}`);

      // Extract transactions using same logic as main endpoint
      let transactions: any[] = [];

      if (Array.isArray(transactionsResponse)) {
        transactions = transactionsResponse;
      } else if (transactionsResponse?.transactions) {
        if (Array.isArray(transactionsResponse.transactions)) {
          transactions = transactionsResponse.transactions;
        } else if (transactionsResponse.transactions?.booked && Array.isArray(transactionsResponse.transactions.booked)) {
          transactions = transactionsResponse.transactions.booked;
        } else if (transactionsResponse.transactions?.pending && Array.isArray(transactionsResponse.transactions.pending)) {
          transactions = transactionsResponse.transactions.pending;
        }
      } else if (transactionsResponse?.data?.transactions && Array.isArray(transactionsResponse.data.transactions)) {
        transactions = transactionsResponse.data.transactions;
      } else if (transactionsResponse?.data && Array.isArray(transactionsResponse.data)) {
        transactions = transactionsResponse.data;
      } else if (transactionsResponse?.booked && Array.isArray(transactionsResponse.booked)) {
        transactions = transactionsResponse.booked;
      } else {
        const responseKeys = Object.keys(transactionsResponse || {});
        for (const key of responseKeys) {
          if (Array.isArray(transactionsResponse[key])) {
            transactions = transactionsResponse[key];
            break;
          }
        }
      }

      if (transactions.length === 0) {
        return {
          message: 'No transactions found',
          rawResponse: transactionsResponse,
          structure: null,
        };
      }

      // Analyze structure
      const sampleTransaction = transactions[0];
      const allFields = new Set<string>();
      const fieldTypes: { [key: string]: string } = {};
      const fieldExamples: { [key: string]: any } = {};

      transactions.forEach(tx => {
        Object.keys(tx).forEach(key => {
          allFields.add(key);
          const value = tx[key];
          const valueType = typeof value;

          if (!fieldTypes[key]) {
            fieldTypes[key] = valueType;
          }

          if (!fieldExamples[key] && value !== null && value !== undefined) {
            // Store a sample value (truncate if too long)
            if (typeof value === 'string' && value.length > 100) {
              fieldExamples[key] = value.substring(0, 100) + '...';
            } else if (typeof value === 'object' && !Array.isArray(value)) {
              fieldExamples[key] = JSON.stringify(value).substring(0, 200);
            } else {
              fieldExamples[key] = value;
            }
          }
        });
      });

      // Categorize fields
      const importantFields = [
        'transactionId', 'bookingDate', 'valueDate', 'transactionAmount',
        'remittanceInformationUnstructured', 'creditorName', 'debtorName',
        'category', 'standardName', 'amount', 'currency'
      ];

      const categorizedFields = {
        identifiers: Array.from(allFields).filter(f => f.includes('Id') || f.includes('Reference')),
        dates: Array.from(allFields).filter(f => f.includes('Date') || f.includes('Time')),
        amounts: Array.from(allFields).filter(f => f.includes('Amount') || f.includes('amount') || f === 'currency'),
        descriptions: Array.from(allFields).filter(f => f.includes('Information') || f.includes('Name') || f.includes('Description')),
        categories: Array.from(allFields).filter(f => f.includes('category') || f.includes('Category') || f.includes('Code')),
        other: Array.from(allFields).filter(f => !importantFields.some(imp => f.toLowerCase().includes(imp.toLowerCase()))),
      };

      return {
        metadata: {
          accountName: firstAccount.name,
          totalTransactions: transactions.length,
          dateRange: { from: dateFrom, to: dateTo },
          responseStructure: {
            isArray: Array.isArray(transactionsResponse),
            topLevelKeys: Object.keys(transactionsResponse || {}),
          },
        },
        structure: {
          allFields: Array.from(allFields).sort(),
          categorizedFields,
          fieldTypes,
          fieldExamples: Object.fromEntries(
            Array.from(allFields).map(field => [
              field,
              {
                type: fieldTypes[field],
                example: fieldExamples[field],
                isImportant: importantFields.some(imp => field.toLowerCase().includes(imp.toLowerCase())),
              }
            ])
          ),
        },
        sampleTransaction: sampleTransaction,
        sampleTransactions: transactions.slice(0, 3), // First 3 for inspection
        rawResponseSample: transactionsResponse, // Full raw response for reference
      };
    } catch (error: any) {
      this.logger.error(`Failed to analyze transactions structure: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze transactions structure: ${error.message}`);
    }
  }

  /**
   * Debug endpoint to get transaction structure
   * Returns a sample transaction and field analysis
   */
  @Get('transactions-structure')
  @UseGuards(FirebaseAuthGuard)
  async getTransactionsStructure(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const sub = `${firebaseId}_sub`;

    try {
      // Get accounts first
      const accountsResponse = await this.feezbackService.getUserAccounts(sub);
      const accounts = accountsResponse?.accounts || [];

      if (accounts.length === 0) {
        return {
          message: 'No accounts found',
          structure: null,
        };
      }

      // Get transactions from first account only (for structure analysis)
      const firstAccount = accounts[0];
      if (!firstAccount.transactionsLink) {
        return {
          message: 'First account has no transactions link',
          structure: null,
        };
      }

      const today = new Date();
      const dateFrom = '2026-01-01';
      const dateTo = today.toISOString().split('T')[0];

      const transactionsResponse = await this.feezbackService.getAccountTransactions(
        sub,
        firstAccount._links.transactions.href,
        // firstAccount.transactionsLink,
        'booked',
        dateFrom,
        dateTo,
      );

      let transactions: any[] = [];
      if (Array.isArray(transactionsResponse)) {
        transactions = transactionsResponse;
      } else if (transactionsResponse?.transactions) {
        if (Array.isArray(transactionsResponse.transactions)) {
          transactions = transactionsResponse.transactions;
        } else if (transactionsResponse.transactions?.booked && Array.isArray(transactionsResponse.transactions.booked)) {
          transactions = transactionsResponse.transactions.booked;
        } else if (transactionsResponse.transactions?.pending && Array.isArray(transactionsResponse.transactions.pending)) {
          transactions = transactionsResponse.transactions.pending;
        }
      } else if (transactionsResponse?.data?.transactions) {
        transactions = Array.isArray(transactionsResponse.data.transactions) ? transactionsResponse.data.transactions : [];
      }

      if (transactions.length === 0) {
        return {
          message: 'No transactions found',
          structure: null,
        };
      }

      // Analyze structure
      const sampleTransaction = transactions[0];
      const allFields = new Set<string>();

      transactions.forEach(tx => {
        Object.keys(tx).forEach(key => allFields.add(key));
      });

      return {
        metadata: {
          accountName: firstAccount.name,
          totalTransactions: transactions.length,
          dateRange: { from: dateFrom, to: dateTo },
        },
        structure: {
          allFields: Array.from(allFields).sort(),
          sampleTransaction,
          fieldDescriptions: this.analyzeTransactionFields(sampleTransaction),
        },
        sampleTransactions: transactions.slice(0, 5), // First 5 for inspection
      };
    } catch (error: any) {
      this.logger.error(`Failed to get transactions structure: ${error.message}`, error.stack);
      throw new Error(`Failed to get transactions structure: ${error.message}`);
    }
  }

  /**
   * Analyze transaction fields and provide descriptions
   */
  private analyzeTransactionFields(transaction: any): { [key: string]: any } {
    const analysis: { [key: string]: any } = {};

    Object.keys(transaction).forEach(key => {
      const value = transaction[key];
      analysis[key] = {
        type: typeof value,
        value: value,
        isArray: Array.isArray(value),
        isObject: typeof value === 'object' && value !== null && !Array.isArray(value),
        sampleValue: value,
      };
    });

    return analysis;
  }

  /**
   * List all saved transaction files
   */
  @Get('saved-transactions-files')
  @UseGuards(FirebaseAuthGuard)
  async listSavedTransactionFiles(@Req() req: AuthenticatedRequest) {
    try {
      const baseDir = process.cwd();
      const outputDir = path.join(baseDir, 'src', 'feezback', 'transactions-data');

      if (!fs.existsSync(outputDir)) {
        return {
          message: 'No transactions data directory found',
          directory: outputDir,
          files: [],
        };
      }

      const files = fs.readdirSync(outputDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(outputDir, file);
          const stats = fs.statSync(filePath);
          return {
            fileName: file,
            filePath: filePath,
            size: `${(stats.size / 1024).toFixed(2)} KB`,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()); // Most recent first

      return {
        directory: outputDir,
        totalFiles: files.length,
        files: files,
      };
    } catch (error: any) {
      this.logger.error(`Failed to list transaction files: ${error.message}`, error.stack);
      throw new Error(`Failed to list transaction files: ${error.message}`);
    }
  }
}