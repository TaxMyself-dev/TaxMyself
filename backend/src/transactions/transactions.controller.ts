import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, ConflictException, ForbiddenException, UsePipes, ValidationPipe, Put, UseGuards, Req, HttpCode, HttpStatus, HttpException, Logger } from '@nestjs/common';
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
import multer from 'multer';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UserSyncStateService } from './user-sync-state.service';
import { FeezbackService } from '../feezback/feezback.service';
import { ModuleName } from '../enum';


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
  ) {}

  @Get('sync-status')
  @UseGuards(FirebaseAuthGuard)
  async getSyncStatus(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const state = await this.userSyncStateService.getSyncState(userId);

    // 'empty' is a backend-only state — never returned to the frontend.
    // Translate it to 'running' and trigger a sync so data will be available shortly.
    const toFrontendStatus = (s: string | null | undefined): string =>
      !s || s === 'empty' ? 'running' : s;

    if (!state) {
      void this.feezbackService.triggerFullSync(userId, 'login').catch(err =>
        this.logger.error('[SyncStatus] triggerFullSync failed (no row)', err?.stack ?? err),
      );
      return {
        quickSync: { processStatus: 'running', resultStatus: 'none', rowsWritten: 0, finishedAt: null, failureReason: null, skipReason: null },
        fullSync:  { processStatus: 'running', resultStatus: 'none', rowsWritten: 0, finishedAt: null, failureReason: null, skipReason: null },
      };
    }

    const BLOCKING_STATUSES = ['completed', 'running'];
    const quickIsEmpty = !BLOCKING_STATUSES.includes(state.quickProcessStatus as string);
    // Only retrigger on quick being empty — full sync failing alone does NOT reset quick,
    // so the user still has their recent data and shouldn't see a loading spinner.
    if (quickIsEmpty) {
      void this.feezbackService.triggerFullSync(userId, 'login').catch(err =>
        this.logger.error('[SyncStatus] triggerFullSync failed (empty status)', err?.stack ?? err),
      );
    }

    return {
      quickSync: {
        processStatus: toFrontendStatus(state.quickProcessStatus),
        resultStatus:  state.quickResultStatus,
        rowsWritten:   state.quickRowsWritten,
        finishedAt:    state.quickFinishedAt ?? null,
        failureReason: state.quickFailureReason ?? null,
        skipReason:    state.quickSkipReason ?? null,
      },
      fullSync: {
        processStatus: toFrontendStatus(state.fullProcessStatus),
        resultStatus:  state.fullResultStatus,
        rowsWritten:   state.fullRowsWritten,
        finishedAt:    state.fullFinishedAt ?? null,
        failureReason: state.fullFailureReason ?? null,
        skipReason:    state.fullSkipReason ?? null,
      },
    };
  }

  /**
   * Returns true only when the user's quick sync stage is 'completed'.
   * Every other status blocks the fetch and returns [].
   *
   * When the state is missing or 'empty', a fire-and-forget sync is triggered
   * so that the next poll will see 'running' → 'completed'.
   */
  private async syncStateAllowsFetch(userId: string): Promise<boolean> {
    const state = await this.userSyncStateService.getSyncState(userId);
    const status = state?.quickProcessStatus ?? null;

    if (!state || !['completed', 'running'].includes(status as string)) {
      void this.feezbackService.triggerFullSync(userId, 'manual').catch(err =>
        this.logger.error('[SyncGuard] triggerFullSync failed', err?.stack ?? err),
      );
      return false;
    }

    return status === 'completed';
  }

  @Post('trigger-sync')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async triggerSync(@Req() request: AuthenticatedRequest): Promise<{ status: 'started' | 'already_running' }> {
    const userId = request.user?.firebaseId;
    const masked = userId?.length >= 8 ? userId.substring(0, 8) + '...' : (userId ?? '?');

    this.logger.log(`[TriggerSync] Manual sync requested | firebaseId=${masked}`);

    // Gate 1 — OPEN_BANKING module access
    const user = await this.usersService.findByFirebaseId(userId);
    if (!user?.modulesAccess?.includes(ModuleName.OPEN_BANKING)) {
      this.logger.log(`[TriggerSync] Rejected — no OPEN_BANKING access | firebaseId=${masked}`);
      throw new ForbiddenException('User does not have Open Banking access');
    }

    // Gate 2 — already running (checked via persisted sync state)
    const state = await this.userSyncStateService.getSyncState(userId);
    const isRunning =
      state?.quickProcessStatus === 'running' || state?.fullProcessStatus === 'running';
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

    const billIds = parseCsvParam(query.billId);
    const categories = parseCsvParam(query.categories);
    const sources = parseCsvParam(query.sources);

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

    const billIds = parseCsvParam(query.billId);
    const categories = parseCsvParam(query.categories);
    const sources = parseCsvParam(query.sources);

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
    console.log("🚀 ~ TransactionsController ~ classifyTransaction ~ dto:", dto)
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
    });

    if (result.status === 'blocked_vat_reported') {
      throw new BadRequestException(result.message);
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

}

/**
 * Parses a comma-separated query-param string into a string array.
 * Returns null when the param is absent, empty, or the literal "null".
 */
function parseCsvParam(value: string | undefined | null): string[] | null {
  if (!value || value === 'null' || value.trim() === '') return null;
  return value.split(',');
}
