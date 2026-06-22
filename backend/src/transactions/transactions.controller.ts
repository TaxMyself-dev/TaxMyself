import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, ConflictException, ForbiddenException, UsePipes, ValidationPipe, Put, UseGuards, Req, HttpCode, HttpStatus, HttpException, Logger, Inject, forwardRef } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { TransactionProcessingService } from './transaction-processing.service';
import { SharedService } from '../shared/shared.service';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: import kept only for the return-type annotation on getIncomesToBuildReport. Remove when that endpoint is migrated.
import { Transactions } from './transactions.entity';
import { UsersService } from '../users/users.service';
import { CreateBillDto } from './dtos/create-bill.dto';
import { Source } from './source.entity';
import { GetTransactionsDto } from './dtos/get-transactions.dto';
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import { UpdateClassificationRuleDto } from './dtos/update-classification-rule.dto';
import multer from 'multer';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UserSyncStateService } from './user-sync-state.service';
import { FeezbackService } from '../feezback/feezback.service';
import { ModuleName } from '../enum';
import { SourceResult } from './user-source-sync-state.entity';
import { FlowAnalysisDto } from './dtos/flow-analysis.dto';
import { FlowAnalysisResponse } from './interfaces/flow-analysis-response.interface';
import { ExpensesService } from '../expenses/expenses.service';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { BillingService } from '../billing/services/billing.service';

// ── Dev simulator scenario specs (shared by the 3 staged dev endpoints) ──────
type SimSpec = {
  processStatus: 'completed' | 'failed';
  resultStatus: 'success' | 'failed' | 'partial_success';
  rowsWritten: number;
  sources: SourceResult[];
};
const SIM_CONSENT = 'sim-consent-A';
const SIM_SPECS: Record<string, SimSpec> = {
  success: {
    processStatus: 'completed', resultStatus: 'success', rowsWritten: 171,
    sources: [
      { type: 'bank', sourceId: '1234567', status: 'success', transactionCount: 76, consentId: SIM_CONSENT },
      { type: 'bank', sourceId: '7654321', status: 'success', transactionCount: 42, consentId: SIM_CONSENT },
      { type: 'card', sourceId: '9999',    status: 'success', transactionCount: 35, consentId: SIM_CONSENT, resourceId: 'sim-card-9999' },
      { type: 'card', sourceId: '8888',    status: 'success', transactionCount: 18, consentId: SIM_CONSENT, resourceId: 'sim-card-8888' },
    ],
  },
  allFailed: {
    processStatus: 'completed', resultStatus: 'failed', rowsWritten: 0,
    sources: [
      { type: 'bank', sourceId: '1234567', status: 'failed', transactionCount: 0, consentId: SIM_CONSENT, error: '503 Service Unavailable' },
      { type: 'bank', sourceId: '7654321', status: 'failed', transactionCount: 0, consentId: SIM_CONSENT, error: '503 Service Unavailable' },
      { type: 'card', sourceId: '9999',    status: 'failed', transactionCount: 0, consentId: SIM_CONSENT, resourceId: 'sim-card-9999', error: '403 Forbidden' },
      { type: 'card', sourceId: '8888',    status: 'failed', transactionCount: 0, consentId: SIM_CONSENT, resourceId: 'sim-card-8888', error: '500 Internal Server Error' },
    ],
  },
  partialSync: {
    processStatus: 'completed', resultStatus: 'partial_success', rowsWritten: 111,
    sources: [
      { type: 'bank', sourceId: '1234567', status: 'success', transactionCount: 76, consentId: SIM_CONSENT },
      { type: 'bank', sourceId: '7654321', status: 'failed',  transactionCount: 0,  consentId: SIM_CONSENT, error: '503 Service Unavailable' },
      { type: 'card', sourceId: '9999',    status: 'success', transactionCount: 35, consentId: SIM_CONSENT, resourceId: 'sim-card-9999' },
      { type: 'card', sourceId: '8888',    status: 'failed',  transactionCount: 0,  consentId: SIM_CONSENT, resourceId: 'sim-card-8888', error: '500 Internal Server Error' },
    ],
  },
  partialConsent: {
    processStatus: 'completed', resultStatus: 'partial_success', rowsWritten: 111,
    sources: [
      { type: 'bank', sourceId: '1234567', status: 'success',    transactionCount: 76, consentId: SIM_CONSENT },
      { type: 'bank', sourceId: '7654321', status: 'not_synced', transactionCount: 0 },
      { type: 'card', sourceId: '9999',    status: 'success',    transactionCount: 35, consentId: SIM_CONSENT, resourceId: 'sim-card-9999' },
      { type: 'card', sourceId: '8888',    status: 'not_synced', transactionCount: 0,  resourceId: 'sim-card-8888' },
    ],
  },
};


@Controller('transactions')
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly processingService: TransactionProcessingService,
    private readonly sharedService: SharedService,
    private readonly userSyncStateService: UserSyncStateService,
    private readonly usersService: UsersService,
    private readonly feezbackService: FeezbackService,
    private readonly expensesService: ExpensesService,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
  ) {}

  /**
   * Pure read: returns the persisted sync state. Does NOT trigger a sync.
   *
   * Sync triggers live elsewhere — `/auth/signin` (triggerPostLoginSync),
   * `POST /transactions/trigger-sync` (manual), and the `UserDataIsAvailable`
   * webhook (post-consent). This endpoint is polled every 3 s and must not
   * itself be a trigger, otherwise it races with consent flows.
   *
   * Status translation:
   *   - If a consent flow is in progress (lastConsentInitiatedAt is fresh and
   *     no sync has finished after it), report 'running'. The webhook will
   *     fire the sync; the frontend keeps polling and the dialog stays in
   *     loading until fullFinishedAt > lastConsentInitiatedAt.
   *   - Otherwise, 'empty'/null translates to 'completed' so the poller stops.
   */
  @Get('sync-status')
  @UseGuards(FirebaseAuthGuard)
  async getSyncStatus(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const [state, sources] = await Promise.all([
      this.userSyncStateService.getSyncState(userId),
      this.userSyncStateService.getSourceResults(userId),
    ]);

    const inConsentFlow = this.feezbackService.hasUnprocessedConsentFlow(state);

    const toFrontendStatus = (s: string | null | undefined): string => {
      if (s === 'running') return 'running';
      if (inConsentFlow) return 'running';
      return !s || s === 'empty' ? 'completed' : s;
    };

    if (!state) {
      return {
        fullSync: {
          processStatus: inConsentFlow ? 'running' : 'completed',
          resultStatus: 'none', rowsWritten: 0, finishedAt: null, failureReason: null, skipReason: null,
        },
        sourceResults: [],
      };
    }

    return {
      fullSync: {
        processStatus: toFrontendStatus(state.fullProcessStatus),
        resultStatus:  state.fullResultStatus,
        rowsWritten:   state.fullRowsWritten,
        finishedAt:    state.fullFinishedAt ?? null,
        failureReason: state.fullFailureReason ?? null,
        skipReason:    state.fullSkipReason ?? null,
      },
      sourceResults: sources,
    };
  }

  @Post('retry-source')
  @UseGuards(FirebaseAuthGuard)
  async retrySource(
    @Req() request: AuthenticatedRequest,
    @Body() body: { type: 'card' | 'bank'; sourceId: string },
  ) {
    const userId = request.user?.firebaseId;
    if (!body?.type || !body?.sourceId) {
      throw new BadRequestException('type and sourceId are required');
    }

    // Block per-source retry while a full sync is running — both paths write to
    // user_source_sync_state and call processingService.process(); racing them
    // can produce duplicate transactions or clobbered source statuses.
    const state = await this.userSyncStateService.getSyncState(userId);
    if (state?.fullProcessStatus === 'running') {
      throw new ConflictException('Sync is already running — please wait for it to finish');
    }

    const result = await this.feezbackService.retrySource(userId, body.type, body.sourceId);
    return result;
  }

  /**
   * Returns true only when the user's sync is 'completed'.
   * Every other status blocks the fetch and returns [].
   *
   * Does NOT trigger a sync — guards must not be triggers. If state is missing
   * or 'empty', the user can re-trigger via /trigger-sync (or it'll happen on
   * next signin / consent flow).
   */
  private async syncStateAllowsFetch(userId: string): Promise<boolean> {
    const state = await this.userSyncStateService.getSyncState(userId);
    return state?.fullProcessStatus === 'completed';
  }

  /**
   * Backfill `ilsAmount` + `fxRateToIls` on non-ILS cache rows whose FX columns
   * are null. Use case: rows synced before the FX layer existed (or before BOI
   * was reachable) won't render the "(₪Y)" parenthesis in תזרים. Hit this
   * endpoint once to stamp them all. Idempotent — already-stamped rows are
   * skipped by the WHERE clause.
   */
  @Post('backfill-fx')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async backfillFx(@Req() request: AuthenticatedRequest): Promise<{ updated: number; skipped: number; total: number }> {
    const userId = request.user?.firebaseId;
    return this.processingService.backfillFxForUser(userId);
  }

  @Post('trigger-sync')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async triggerSync(@Req() request: AuthenticatedRequest): Promise<{ status: 'started' | 'already_running' }> {
    const userId = request.user?.firebaseId;
    const masked = userId?.length >= 8 ? userId.substring(0, 8) + '...' : (userId ?? '?');

    this.logger.log(`[TriggerSync] Manual sync requested | firebaseId=${masked}`);

    // Gate 1 — OPEN_BANKING module access
    const hasAccess = await this.billingService.hasModuleAccess(userId, ModuleName.OPEN_BANKING);
    if (!hasAccess) {
      this.logger.log(`[TriggerSync] Rejected — no OPEN_BANKING access | firebaseId=${masked}`);
      throw new ForbiddenException('User does not have Open Banking access');
    }

    // Gate 2 — already running (checked via persisted sync state)
    const state = await this.userSyncStateService.getSyncState(userId);
    const isRunning = state?.fullProcessStatus === 'running';
    if (isRunning) {
      this.logger.log(`[TriggerSync] Rejected — sync already running | firebaseId=${masked}`);
      return { status: 'already_running' };
    }

    // Fire-and-forget — do not block the response
    this.logger.log(`[TriggerSync] Accepted — starting sync | firebaseId=${masked}`);
    void this.feezbackService.triggerFullSync(userId, 'manual').catch(err =>
      this.logger.error(
        `[TriggerSync] Async error from triggerFullSync | firebaseId=${masked}`,
        err?.stack ?? err,
      ),
    );

    return { status: 'started' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  DEV-ONLY simulation endpoints — let the admin panel reproduce each
  //  user-visible sync outcome (success, all-failed, partial-sync, partial-consent)
  //  without going through Feezback. Both endpoints 403 in production.
  // ───────────────────────────────────────────────────────────────────────────

  private resolveSimSpec(scenario: string): SimSpec {
    const sim = SIM_SPECS[scenario];
    if (!sim) {
      throw new BadRequestException(
        `Unknown scenario "${scenario}". Available: ${Object.keys(SIM_SPECS).join(', ')}`,
      );
    }
    return sim;
  }

  private maskId(userId: string | undefined): string {
    return userId?.length >= 8 ? userId.substring(0, 8) + '...' : (userId ?? '?');
  }

  // ── Dev simulator, STAGED to mirror the real temporal flow ──────────────────
  //
  // Stage A: devSimulateSync     — user clicked "סיום" in Feezback & returned.
  //                                Stamps consent; leaves state "awaiting webhook"
  //                                so the FE's post-consent-sync poll prints
  //                                "[PostConsent] user … waiting for data-available webhook".
  // Stage B: devSimulateWebhook  — the UserDataIsAvailable webhook arrives
  //                                (FE schedules this ~15s later). Prints the
  //                                real DATA-AVAILABLE/SOURCE-DISCOVERY block,
  //                                seeds discovered sources, stamps refreshed.
  // Stage C: devSimulatePull     — user clicked "למשיכת התנועות". Prints the
  //                                real SYNC RESULTS [FULL SYNC] block and seeds
  //                                the finished sync state.
  // All three are dev-only (NODE_ENV !== production).

  @Post('dev/simulate-sync')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async devSimulateSync(
    @Req() request: AuthenticatedRequest,
    @Query('scenario') scenario: string,
  ): Promise<{ status: 'simulated'; scenario: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev simulator is disabled in production');
    }
    const userId = request.user?.firebaseId;
    const masked = this.maskId(userId);
    this.resolveSimSpec(scenario); // validate early

    // Fresh start: wipe per-source rows and coerce out of any 'running' state.
    console.log(`[DEV SIM] Resetting prior sync state for user=${masked}`);
    await this.userSyncStateService.clearSourceResults(userId);
    await this.userSyncStateService.markSyncFailed(userId, '__dev_sim_reset__').catch(() => { /* row may not exist */ });

    // Stage A — user returned from Feezback after success. Stamp consent so
    // hasUnprocessedConsentFlow() is true → post-consent-sync returns 'pending'
    // and the FE poll prints the real "waiting for data-available webhook" line.
    await this.feezbackService.markConsentInitiated(userId);
    console.log(
      `[DEV SIM][Stage A] user ${masked} returned from Feezback (scenario=${scenario}) — consent stamped, awaiting data-available webhook`,
    );
    return { status: 'simulated', scenario };
  }

  @Post('dev/simulate-webhook')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async devSimulateWebhook(
    @Req() request: AuthenticatedRequest,
    @Query('scenario') scenario: string,
  ): Promise<{ status: 'webhook-simulated'; scenario: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev simulator is disabled in production');
    }
    const userId = request.user?.firebaseId;
    const masked = this.maskId(userId);
    const sim = this.resolveSimSpec(scenario);

    // Stage B — simulate the UserDataIsAvailable webhook: print the SAME block
    // refreshUserSources prints in the real flow (print #2).
    const banks = sim.sources.filter(s => s.type === 'bank');
    const cards = sim.sources.filter(s => s.type === 'card');
    console.log(`\n════════════════════════════════════`);
    console.log(`  DATA AVAILABLE WEBHOOK ARRIVED`);
    console.log(`  Arrived at: ${new Date().toISOString()}`);
    console.log(`  SOURCE DISCOVERY  (UserDataIsAvailable)`);
    console.log(`  User: ${masked}`);
    console.log(`  (valid accounts below)`);
    console.log(`════════════════════════════════════`);
    console.log(`  Bank (${banks.length}):`);
    for (const s of banks) console.log(`    •  ${s.sourceId}   consentId=${s.consentId ?? '—'}`);
    console.log(`  Cards (${cards.length}):`);
    for (const s of cards) console.log(`    •  ${s.sourceId}   consentId=${s.consentId ?? '—'}`);
    console.log(`════════════════════════════════════\n`);

    // Register discovered sources as 'not_synced' (discovered, not yet pulled)
    // and stamp the freshness marker so hasUnprocessedConsentFlow() → false
    // (post-consent-sync flips to 'completed' → FE enables the pull button).
    await this.userSyncStateService.updateSourceResults(
      userId,
      sim.sources.map(s => ({ ...s, status: 'not_synced' as const, transactionCount: 0, error: undefined })),
    );
    await this.userSyncStateService.markSourcesRefreshed(userId);
    return { status: 'webhook-simulated', scenario };
  }

  @Post('dev/simulate-pull')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async devSimulatePull(
    @Req() request: AuthenticatedRequest,
    @Query('scenario') scenario: string,
  ): Promise<{ status: 'pull-simulated'; scenario: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev simulator is disabled in production');
    }
    const userId = request.user?.firebaseId;
    const masked = this.maskId(userId);
    const sim = this.resolveSimSpec(scenario);

    // Stage C — user clicked "למשיכת התנועות". Print the SAME SYNC RESULTS
    // block doFullSync prints for a manual pull (print #3).
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const yearBack = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    console.log(`🔁 [FullSync] Forcing sync — manual pull (DEV SIM) | firebaseId=${masked}\n`);
    console.log(`════════════════════════════════════`);
    console.log(`  FULL SYNC`);
    console.log(`  User : ${masked}`);
    console.log(`  Dates: ${yearBack} → ${fmt(today)}`);
    console.log(`════════════════════════════════════`);
    console.log(`  Pull — (mocked)\n`);

    const allOk = sim.sources.every(s => s.status === 'success');
    console.log(`════════════════════════════════════`);
    console.log(`  SYNC RESULTS [FULL SYNC] — ${allOk ? '✅ OK' : '⚠️  ERRORS'}`);
    console.log(`════════════════════════════════════`);
    for (const s of sim.sources) {
      const icon = s.status === 'success' ? '✓' : s.status === 'failed' ? '✗' : '○';
      const label = s.type === 'bank' ? 'Bank' : 'Card';
      const id = s.type === 'bank' ? s.sourceId : `*${s.sourceId}`;
      const detail = s.status === 'success'
        ? `SUCCESS — ${s.transactionCount} transactions`
        : s.status === 'failed' ? `FAILED — ${s.error}` : 'not synced (no consent)';
      console.log(`  ${icon}  ${label.padEnd(4)} ${id.padEnd(20)} ${detail}`);
    }
    console.log(`════════════════════════════════════`);
    console.log(`  DONE | ${sim.rowsWritten} saved | total=0s (mocked)\n`);

    // Seed the finished sync state with the scenario's per-source results.
    await this.userSyncStateService.markSyncFinished(userId, sim.processStatus, sim.resultStatus, sim.rowsWritten);
    await this.userSyncStateService.updateSourceResults(userId, sim.sources);
    return { status: 'pull-simulated', scenario };
  }

  @Post('dev/reset-sim')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async devResetSim(@Req() request: AuthenticatedRequest): Promise<{ status: 'reset' }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev simulator is disabled in production');
    }
    const userId = request.user?.firebaseId;
    const masked = userId?.length >= 8 ? userId.substring(0, 8) + '...' : (userId ?? '?');

    await this.userSyncStateService.clearSourceResults(userId);
    await this.userSyncStateService.markSyncEmpty(userId).catch(() => { /* row may not exist */ });

    console.log(`[DevSim] Reset simulation state | user=${masked}\n`);
    return { status: 'reset' };
  }

  /**
   * Called by the frontend when the user returns from the Feezback consent portal.
   *
   * Single-pull architecture: this endpoint does NOT trigger a transaction sync.
   * The `UserDataIsAvailable` webhook is the sole sync trigger. This endpoint:
   *   1. Refreshes Source rows from the Feezback API (idempotent; safe to repeat).
   *   2. Compares `fullFinishedAt` against `lastConsentInitiatedAt` (stamped by
   *      consent-link controller when the user clicked "Connect Open Banking").
   *      If a webhook-triggered sync has already finished AFTER the consent
   *      click, returns `'completed'` so the frontend can skip polling.
   *      Otherwise returns `'pending'` and the frontend polls `/sync-status`
   *      until the webhook fires the sync.
   *
   * This works regardless of how long the user spent on the Feezback portal —
   * no time windows, no arbitrary thresholds.
   */
  @Post('post-consent-sync')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async postConsentSync(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ status: 'completed' | 'pending' }> {
    const userId = request.user?.firebaseId;
    const masked = userId?.length >= 8 ? userId.substring(0, 8) + '...' : (userId ?? '?');

    this.logger.log(`[PostConsentSync] Called | firebaseId=${masked}`);

    // Pure read: do NOT call refreshUserSources here. The UserDataIsAvailable
    // webhook is the sole source-refresh trigger after a consent flow; calling
    // it again from here doubled the Feezback API calls for no functional gain
    // (the decision below uses only timestamps, not source rows).
    const state = await this.userSyncStateService.getSyncState(userId);

    if (state?.fullProcessStatus === 'running') {
      this.logger.log(`[PostConsentSync] Sync in flight — frontend will poll | firebaseId=${masked}`);
      return { status: 'pending' };
    }

    // Strict structural check: has a sync FINISHED AFTER the consent click?
    // Same helper used by /sync-status and triggerPostLoginSync — single
    // source of truth, no timestamp tolerance.
    if (this.feezbackService.hasUnprocessedConsentFlow(state)) {
      this.logger.log(
        `[PostConsent] user ${masked} back from feezback success consent flow — waiting for data-available webhook`,
      );
      return { status: 'pending' };
    }

    this.logger.log(
      `[PostConsentSync] Webhook sync already completed for this flow | firebaseId=${masked}`,
    );
    return { status: 'completed' };
  }

  @Delete('admin/clear-cache/:firebaseId')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async adminClearUserCache(
    @Req() request: AuthenticatedRequest,
    @Param('firebaseId') targetFirebaseId: string,
  ): Promise<{ status: 'cleared' }> {
    const adminId = request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(adminId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    await this.processingService.clearUserCache(targetFirebaseId);
    this.logger.log(`[AdminClearCache] Cache cleared | targetUser=${targetFirebaseId} | by=${adminId}`);
    return { status: 'cleared' };
  }

  @Get('flow-analysis')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getFlowAnalysis(
    @Req() request: AuthenticatedRequest,
    @Query() query: FlowAnalysisDto,
  ): Promise<FlowAnalysisResponse | { totalExpenses: 0; totalIncomes: 0; monthlyFlow: []; expensesByCategory: []; hasMoreCategories: false }> {
    const userId = request.user?.firebaseId;

    const billId = Number(query.billId);
    if (!Number.isFinite(billId) || billId <= 0) {
      throw new BadRequestException('billId must be a valid positive number');
    }

    if (!await this.syncStateAllowsFetch(userId)) {
      return { totalExpenses: 0, totalIncomes: 0, monthlyFlow: [], expensesByCategory: [], hasMoreCategories: false };
    }

    return this.processingService.getFlowAnalysis(
      userId,
      query.startDate,
      query.endDate,
      billId,
      query.lineFilterType,
      query.lineFilterValue,
    );
  }

  @Get('flow-analysis-merchants')
  @UseGuards(FirebaseAuthGuard)
  async getFlowAnalysisMerchants(
    @Req() request: AuthenticatedRequest,
    @Query('billId') billId?: string,
  ): Promise<string[]> {
    const userId = request.user?.firebaseId;
    const numericBillId = billId ? Number(billId) : undefined;
    return this.transactionsService.getDistinctMerchants(
      userId,
      numericBillId && Number.isFinite(numericBillId) ? numericBillId : undefined,
    );
  }

  @Get('get-all-user-sub-categories')
  @UseGuards(FirebaseAuthGuard)
  async getAllUserSubCategories(
    @Req() request: AuthenticatedRequest,
    @Query('billId') billId?: string,
  ): Promise<UserSubCategory[]> {
    const userId = request.user?.firebaseId;
    let businessNumber: string | undefined;
    if (billId) {
      const numericBillId = Number(billId);
      if (Number.isFinite(numericBillId) && numericBillId > 0) {
        businessNumber = await this.transactionsService.getBusinessNumberByBillId(numericBillId, userId) ?? undefined;
      }
    }
    return this.expensesService.getAllUserSubCategories(userId, businessNumber);
  }

  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: endpoint that triggers the legacy Finsite ingest flow writing to the transactions table. Remove when Feezback pipeline fully replaces it.
  @Get('get-trans')
  //TODO: Add Admin guard
  async getTrans(@Query() query: any) {
    return this.transactionsService.getTransactionsFromFinsite(query.startDate, query.endDate, query.finsiteId );
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: file-upload endpoint that writes parsed Excel rows to the legacy transactions table via saveTransactions(). Remove when replaced by a cache-based ingest.
  @Post('load-file')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = request.user?.firebaseId;
    return this.transactionsService.saveTransactions(file, userId);
  }


  @Post('load-default-categories')
  //TODO: Add Admin guard
  @UseInterceptors(FileInterceptor('file'))
  async loadDefaultCategories(
    @UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.loadDefaultCategories(file)
  }


  @Post('add-bill')
  @UseGuards(FirebaseAuthGuard)
  async addBill(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBillDto) {
    const userId = request.user?.firebaseId;
    return await this.transactionsService.addBill(userId, body);
  }


  @Post(':id/sources')
  @UseGuards(FirebaseAuthGuard)
  async addSourceToBill(
    @Req() request: AuthenticatedRequest,
    @Param('id') billId: number,
    @Body() body: any,
  ): Promise<Source> {
    const userId = request.user?.firebaseId;
    return this.transactionsService.addSourceToBill(billId, body.sourceName, body.sourceType, userId);
  }


  @Get('get-bills')
  @UseGuards(FirebaseAuthGuard)
  async getBills(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    return this.transactionsService.getBillsByUserId(userId);
  }


  @Get('get-sources')
  @UseGuards(FirebaseAuthGuard)
  async getSources(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    return this.transactionsService.getSources(userId);
  }

  @Get('get-sources-with-types')
  @UseGuards(FirebaseAuthGuard)
  async getSourcesWithTypes(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const result = await this.transactionsService.getSourcesWithTypes(userId);
    return result;
  }


  @Get('get-sources-by-bill/:billId')
  @UseGuards(FirebaseAuthGuard)
  async getSourcesByBillId(@Req() request: AuthenticatedRequest, @Param('billId') billId: string) {
    const userId = request.user?.firebaseId;
    const numericBillId = Number(billId);
    if (!Number.isFinite(numericBillId)) {
      throw new BadRequestException('Invalid billId parameter');
    }
    return this.transactionsService.getSourcesByBillId(userId, numericBillId);
  }

  @Get('get-incomes')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesForBill(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<any[]> {
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = request.user?.firebaseId;

    const billIds = parseListParam(query.billId);
    const categories = parseListParam(query.categories);
    const sources = parseListParam(query.sources);

    if (!await this.syncStateAllowsFetch(userId)) {
      return [];
    }

    return this.processingService.getIncomesFromCache(
      userId, startDate, endDate, billIds, categories, sources,
    );
  }


  @Get('get-expenses')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getForBill(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<any[]> {
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = request.user?.firebaseId;

    const billIds = parseListParam(query.billId);
    const categories = parseListParam(query.categories);
    const sources = parseListParam(query.sources);

    if (!await this.syncStateAllowsFetch(userId)) {
      return [];
    }

    return this.processingService.getExpensesFromCache(
      userId, startDate, endDate, billIds, categories, sources,
    );
  }


  // ---------------------------------------------------------------------------
  // Classification domain — routed to the new pipeline
  // ---------------------------------------------------------------------------

  /**
   * POST /transactions/classify-trans
   *
   * Frontend sends the legacy ClassifyTransactionDto shape.
   * Controller resolves the cache row by its numeric id, then delegates to
   * the new pipeline:
   *   isSingleUpdate = true  → classifyManually()  (ONE_TIME)
   *   isSingleUpdate = false → classifyWithRule()   (RULE)
   *
   * Response contract:
   *   200 — classification applied
   *   400 — validation error or VAT lock
   *   409 — ONE_TIME override confirmation required (classifyWithRule only)
   */
  @Post('classify-trans')
  @UseGuards(FirebaseAuthGuard)
  async classifyTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ClassifyTransactionDto,
  ): Promise<any> {
    const userId = request.user?.firebaseId;

    // Resolve cache row using the stable externalTransactionId (= finsiteId).
    // The frontend row may carry either a legacy Transactions.id or a cache PK,
    // but finsiteId is consistent across both data sources.
    const cacheRow = await this.processingService.findCacheRowByExternalId(dto.finsiteId, userId);
    if (!cacheRow) {
      throw new BadRequestException(
        `Transaction with finsiteId ${dto.finsiteId} not found in cache.`,
      );
    }

    const externalTransactionId = cacheRow.externalTransactionId;

    if (dto.isSingleUpdate) {
      // ONE_TIME manual classification
      await this.processingService.classifyManually(userId, {
        externalTransactionId,
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent ?? 0,
        taxPercent: dto.taxPercent ?? 0,
        reductionPercent: dto.reductionPercent ?? 0,
        isEquipment: dto.isEquipment ?? false,
        isRecognized: dto.isRecognized ?? false,
        businessNumber: dto.businessNumber ?? null,
        // Late-arrival reassignment — set by the frontend after the user
        // picks an alternative from the "natural period locked" dialog.
        targetPeriodLabel: dto.targetPeriodLabel,
      });
      return;
    }

    // RULE classification
    const result = await this.processingService.classifyWithRule(userId, {
      externalTransactionId,
      category: dto.category,
      subCategory: dto.subCategory,
      vatPercent: dto.vatPercent ?? 0,
      taxPercent: dto.taxPercent ?? 0,
      reductionPercent: dto.reductionPercent ?? 0,
      isEquipment: dto.isEquipment ?? false,
      isRecognized: dto.isRecognized ?? false,
      isExpense: dto.isExpense,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      minAbsSum: dto.minSum ?? null,
      maxAbsSum: dto.maxSum ?? null,
      commentPattern: dto.comment ?? null,
      commentMatchType: dto.matchType ?? 'equals',
      confirmOverride: dto.confirmOverride,
      businessNumber: dto.businessNumber ?? null,
      targetPeriodLabel: dto.targetPeriodLabel,
    });

    if (result.status === 'blocked_vat_reported') {
      // 423 Locked + typed payload — keeps parity with the classifyManually
      // guard so the frontend can show the dedicated "report submitted" dialog
      // regardless of which classification path the user took.
      throw new HttpException(
        {
          type: 'blocked_report_submitted',
          message: 'התנועה שייכת לדוח שכבר דווח לרשויות המס ולא ניתן לשנות את הסיווג שלה.',
        },
        423,
      );
    }

    if (result.status === 'confirm_override') {
      // 409 so the frontend can show confirmation dialog.
      // The frontend re-sends with confirmOverride = true.
      throw new ConflictException(result.message);
    }

    if (result.status === 'confirm_rule_override') {
      // 409 with a typed payload so the frontend can distinguish this from
      // the ONE_TIME confirm_override case and show the correct dialog.
      throw new ConflictException({ type: 'confirm_rule_override', message: result.message });
    }

    return { ruleId: result.ruleId };
  }


  /**
   * POST /transactions/quick-classify
   *
   * Quick-classifies a transaction with default values (שונות / שונות).
   * Delegates to classifyManually() with ONE_TIME classification.
   */
  @Post('quick-classify')
  @UseGuards(FirebaseAuthGuard)
  async quickClassifyTransaction(
    @Req() request: AuthenticatedRequest,
    @Body('finsiteId') finsiteId: string,
  ): Promise<void> {
    const userId = request.user?.firebaseId;

    const cacheRow = await this.processingService.findCacheRowByExternalId(finsiteId, userId);
    if (!cacheRow) {
      throw new BadRequestException(
        `Transaction with finsiteId ${finsiteId} not found in cache.`,
      );
    }

    await this.processingService.classifyManually(userId, {
      externalTransactionId: cacheRow.externalTransactionId,
      category: 'שונות',
      subCategory: 'שונות',
      vatPercent: 0,
      taxPercent: 0,
      reductionPercent: 0,
      isEquipment: false,
      isRecognized: false,
    });
  }


  /**
   * GET /transactions/get-trans-to-classify
   *
   * Returns cache rows that have no matching slim_transactions row.
   * Response is mapped to the legacy Transactions shape for frontend compat.
   */
  @Get('get-trans-to-classify')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getTransToClassify(
    @Req() request: AuthenticatedRequest,
    @Query() query: any,
  ): Promise<any[]> {
    const userId = request.user?.firebaseId;
    const startDate = query.startDate ? this.sharedService.convertStringToDateObject(query.startDate) : undefined;
    const endDate = query.endDate ? this.sharedService.convertStringToDateObject(query.endDate) : undefined;

    if (!await this.syncStateAllowsFetch(userId)) {
      return [];
    }

    return this.processingService.getTransactionsToClassify(userId, startDate, endDate, query.businessNumber);
  }

  // ---------------------------------------------------------------------------
  // Endpoints still on legacy (outside classification domain scope)
  // ---------------------------------------------------------------------------

  @Patch('update-trans')
  @UseGuards(FirebaseAuthGuard)
  async updateTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() updateDto: UpdateTransactionsDto,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('isSingleMonth') isSingleMonth: boolean
  ): Promise<{ message: string }> {
    console.log("in update trans");
    const userId = request.user?.firebaseId;
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(year, month, isSingleMonth);
    await this.transactionsService.updateTransaction(updateDto, userId, startDate, endDate);
    return { message: 'Transactions updated successfully' };
  }


  @Get('get-transaction-to-confirm-and-add-to-expenses')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getExpensesToBuildReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: any,
  ): Promise<Record<string, any>[]> {
    console.log("query is: ", query);
    const userId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getTransactionToConfirmAndAddToExpenses(userId, query.businessNumber, startDate, endDate);
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: endpoint reads recognised income rows from the legacy transactions table via getIncomesToBuildReport(). Migrate to full_transactions_cache then remove.
  @Get('get-incomes-to-build-report')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesToBuildReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<Transactions[]> {
    const userId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getIncomesToBuildReport(userId, startDate, endDate);
  }


  @Post('save-trans-to-expenses')
  @UseGuards(FirebaseAuthGuard)
  async saveTransToExpenses(
    @Req() request: AuthenticatedRequest,
    @Body() transactionData: {id: number, file?: string | null}[],
  ): Promise<{ message: string }> {
    const userId = request.user?.firebaseId;
    return this.transactionsService.saveTransactionsToExpenses(transactionData, userId);
  }

  /**
   * List the user's classification rules for a single business. The result
   * powers the "הקטגוריות שלי" tab in the Settings page.
   */
  @Get('rules')
  @UseGuards(FirebaseAuthGuard)
  async getUserRules(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const userId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.processingService.listRulesForUser(userId, businessNumber);
  }

  @Delete('rules/:id')
  @UseGuards(FirebaseAuthGuard)
  async deleteUserRule(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const userId = request.user?.firebaseId;
    return this.processingService.deleteRuleForUser(userId, Number(id));
  }

  @Patch('rules/:id')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateUserRule(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateClassificationRuleDto,
  ) {
    const userId = request.user?.firebaseId;
    return this.processingService.updateRuleForUser(userId, Number(id), dto);
  }

}

/**
 * Parses a list query-param into a string array.
 *
 * Accepts:
 *   - string[]  → repeated query params (?categories=A&categories=B). Preferred.
 *   - string    → single value, or legacy comma-joined CSV. The CSV branch is
 *                 a fallback for old callers; it cannot represent values that
 *                 themselves contain a comma (e.g. "בנק, אשראי ותנועות").
 *
 * Returns null when absent/empty or the literal "null" sentinel.
 */
function parseListParam(value: string | string[] | undefined | null): string[] | null {
  if (Array.isArray(value)) {
    const cleaned = value.filter(v => v && v !== 'null' && v.trim() !== '');
    return cleaned.length ? cleaned : null;
  }
  if (!value || value === 'null' || value.trim() === '') return null;
  return value.split(',');
}
