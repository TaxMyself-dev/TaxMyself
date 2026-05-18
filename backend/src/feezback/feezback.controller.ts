import { BadRequestException, Body, Controller, ForbiddenException, Get, Logger, Param, Post, Query, Req, UseGuards, Res } from '@nestjs/common';
import type { SourceResult } from '../transactions/user-source-sync-state.entity';
import { FeezbackService } from './feezback.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { UsersService } from '../users/users.service';
import type { Request, Response } from 'express';
import { log } from 'node:console';
import * as fs from 'fs';
import * as path from 'path';
import { FeezbackWebhookRouterService } from './router/feezback-webhook-router.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';

@Controller('feezback')
export class FeezbackController {
  private readonly logger = new Logger(FeezbackController.name);

  constructor(
    private readonly feezbackService: FeezbackService,
    private readonly usersService: UsersService,
    private readonly routerService: FeezbackWebhookRouterService,
    private readonly userSyncStateService: UserSyncStateService,
  ) { }

  @Post('webhook-router')
  handleWebhookRouter(@Req() req: Request, @Res() res: Response): void {
    // Return 200 immediately (do not block)
    res.status(200).json({ received: true });

    // Fire-and-forget forwarding
    void this.routerService.forward(req).catch((err) => {
      // Should never throw, but just in case
      // this.logger.error('Unexpected error in forward()', err?.stack || String(err));
    });
  }

  @Post('consent-link')
  @UseGuards(FirebaseAuthGuard)
  async createConsentLink(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;

    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    // Stamp the moment the user kicks off the Feezback consent flow. The
    // post-consent endpoint compares this against `fullFinishedAt` to know
    // whether the webhook-triggered sync has already covered this flow —
    // independent of how long the user spends on the Feezback portal.
    //
    // Dedup: if the user double-clicked (the previous stamp is < 5 s old),
    // skip the re-stamp. Without this, the second click would overwrite the
    // first timestamp; if the first flow's sync completes between the two
    // stamps, the post-consent endpoint would falsely report 'pending'.
    //
    // Errors here are NOT swallowed — if stamping fails, the consent flow
    // must not proceed (post-consent and login gates rely on the timestamp).
    // The frontend already shows an error toast on consent-link failure.
    const masked = firebaseId.length >= 8 ? firebaseId.substring(0, 8) + '...' : firebaseId;
    const CLICK_DEDUP_MS = 5_000;
    const state = await this.feezbackService.getUserSyncState(firebaseId);
    const last = state?.lastConsentInitiatedAt;
    const isFreshClick = !last || Date.now() - new Date(last).getTime() > CLICK_DEDUP_MS;
    if (isFreshClick) {
      await this.feezbackService.markConsentInitiated(firebaseId);
      this.logger.log(`[ConsentLink] markConsentInitiated stamped firebaseId=${masked}`);
    } else {
      this.logger.log(`[ConsentLink] markConsentInitiated skipped (dedup ${CLICK_DEDUP_MS}ms) firebaseId=${masked}`);
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


  // @Post('get-access-token')
  // // @UseGuards(FirebaseAuthGuard)
  // async getAccessToken(@Req() req: AuthenticatedRequest) {

  //   // const firebaseId = req.user?.firebaseId;
  //   const firebaseId = "AxFm5xBcYlMTV5kb5OAnde5Rbh62"

  //   if (!firebaseId) {
  //     throw new Error('User ID not found — Firebase authentication required');
  //   }

  //   const token = await (this.feezbackService as any).feezbackJwtService.generateAccessToken(firebaseId);

  //   return { token };
  // }

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

    // this.logger.log(`Fetching accounts for firebaseId: ${firebaseId}, sub: ${sub}`);

    try {
      const accounts = await this.feezbackService.getUserAccounts(sub);
      console.log("accounts: ", accounts);
      return accounts;
    } catch (error: any) {
      // this.logger.error(`Failed to fetch user accounts: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch user accounts: ${error.message}`);
    }
  }

  // @Get('consents/sync')
  // @UseGuards(FirebaseAuthGuard)
  // async syncConsents(@Req() req: AuthenticatedRequest) {
  //   const firebaseId = req.user?.firebaseId;

  //   if (!firebaseId) {
  //     throw new Error('User ID not found — Firebase authentication required');
  //   }

  //   const sub = `${firebaseId}_sub`;

  //   // this.logger.log(`Syncing Feezback consents for firebaseId: ${firebaseId}, sub: ${sub}`);

  //   try {
  //     const consents = await this.feezbackService.syncUserConsents(firebaseId, sub);
  //     return { consents };
  //   } catch (error: any) {
  //     // this.logger.error(`Failed to sync user consents: ${error.message}`, error.stack);
  //     throw new Error(`Failed to sync user consents: ${error.message}`);
  //   }
  // }


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

    // this.logger.log(`Fetching transactions for firebaseId: ${firebaseId}, sub: ${sub}`);
    // this.logger.log(`Transactions link: ${transactionsLink}`);
    // this.logger.log(`Date range: ${defaultDateFrom} to ${defaultDateTo}`);

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
      // this.logger.error(`Failed to fetch transactions: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
  }

  /**
   * Trigger a full sync for a specific user (admin only).
   * Uses the same Quick+Full flow as login/webhook auto sync — the only
   * difference is triggeredBy='manual'.
   */
  @Get('admin-user-transactions')
  @UseGuards(FirebaseAuthGuard)
  async getAdminUserTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('firebaseId') targetFirebaseId: string,
  ) {
    const adminFirebaseId = req.user?.firebaseId;
    if (!adminFirebaseId) throw new Error('Admin authentication required');

    const isAdmin = await this.usersService.isAdmin(adminFirebaseId);
    if (!isAdmin) throw new Error('Admin access required');

    if (!targetFirebaseId) throw new Error('firebaseId parameter is required');

    // Fire-and-forget — same as login/webhook. The in-flight guard prevents double-runs.
    void this.feezbackService.triggerFullSync(targetFirebaseId, 'manual');

    return { message: 'Sync triggered', firebaseId: targetFirebaseId };
  }

  /**
   * Admin: live read of a client's accounts + cards from Feezback.
   * Diagnostic only — does NOT touch the DB.
   */
  @Get('admin/accounts/:firebaseId')
  @UseGuards(FirebaseAuthGuard)
  async adminGetAccountsAndCards(
    @Req() req: AuthenticatedRequest,
    @Param('firebaseId') targetFirebaseId: string,
  ): Promise<{ accounts: any; cards: any }> {
    const adminFirebaseId = req.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(adminFirebaseId);
    if (!isAdmin) throw new ForbiddenException('Admin access required');
    if (!targetFirebaseId) throw new ForbiddenException('firebaseId path parameter is required');

    const targetUser = await this.usersService.findByFirebaseId(targetFirebaseId).catch(() => null);
    const targetName = [targetUser?.fName, targetUser?.lName].filter(Boolean).join(' ') || `${targetFirebaseId.substring(0, 8)}...`;
    const adminMask = adminFirebaseId ? `${adminFirebaseId.substring(0, 8)}...` : '?';
    this.logger.log(`[Admin][GetAccounts] Request sent | target="${targetName}" (${targetFirebaseId.substring(0, 8)}...) | admin=${adminMask}`);

    const result = await this.feezbackService.adminGetAccountsAndCards(targetFirebaseId);
    const accountsCount = result?.accounts?.accounts?.length ?? 0;
    const cardsCount = result?.cards?.cards?.length ?? 0;
    this.logger.log(`[Admin][GetAccounts] Done       | target="${targetName}" | accounts=${accountsCount} | cards=${cardsCount}`);

    return result;
  }

  /**
   * Admin: trigger refreshUserSources for a specific client.
   */
  @Post('admin/refresh-sources/:firebaseId')
  @UseGuards(FirebaseAuthGuard)
  async adminRefreshUserSources(
    @Req() req: AuthenticatedRequest,
    @Param('firebaseId') targetFirebaseId: string,
  ): Promise<{ status: string }> {
    const adminFirebaseId = req.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(adminFirebaseId);
    if (!isAdmin) throw new ForbiddenException('Admin access required');
    if (!targetFirebaseId) throw new ForbiddenException('firebaseId path parameter is required');

    await this.feezbackService.refreshUserSources(targetFirebaseId, 'admin');
    return { status: 'ok' };
  }

  /**
   * Admin: pull transactions for ONE specific source (bank account / card) of
   * a client. Reuses retrySource (bank → pullOneSource, card → card fetch) and
   * its success-side gate promotion.
   *
   * No discovery/refresh fallback: in practice the consentId/resourceId are
   * already in user_source_sync_state. If they aren't, retrySource returns a
   * clear "no valid ID" failure and we surface it as-is — the admin can run
   * "רענון מקורות" explicitly rather than this endpoint doing it implicitly.
   */
  @Post('admin/pull-source/:firebaseId')
  @UseGuards(FirebaseAuthGuard)
  async adminPullSource(
    @Req() req: AuthenticatedRequest,
    @Param('firebaseId') targetFirebaseId: string,
    @Body() body: { type: 'bank' | 'card'; sourceId: string },
  ): Promise<SourceResult> {
    const adminFirebaseId = req.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(adminFirebaseId);
    if (!isAdmin) throw new ForbiddenException('Admin access required');
    if (!targetFirebaseId) throw new ForbiddenException('firebaseId path parameter is required');
    if (!body?.type || !body?.sourceId) throw new BadRequestException('type and sourceId are required');

    const targetMask = `${targetFirebaseId.substring(0, 8)}...`;
    const result = await this.feezbackService.retrySource(targetFirebaseId, body.type, body.sourceId);
    this.logger.log(
      `[Admin][PullSource] Done | target=${targetMask} | type=${body.type} | sourceId=${body.sourceId} | status=${result.status} | count=${result.transactionCount}`,
    );
    return result;
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
      // this.logger.log(`Raw response type: ${typeof transactionsResponse}`);
      // this.logger.log(`Raw response keys: ${Object.keys(transactionsResponse || {}).join(', ')}`);

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
      // this.logger.error(`Failed to analyze transactions structure: ${error.message}`, error.stack);
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
      // this.logger.error(`Failed to get transactions structure: ${error.message}`, error.stack);
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
      // this.logger.error(`Failed to list transaction files: ${error.message}`, error.stack);
      throw new Error(`Failed to list transaction files: ${error.message}`);
    }
  }
}