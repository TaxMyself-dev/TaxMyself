import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, ConflictException, UsePipes, ValidationPipe, Put, UseGuards, Req, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
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


@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly processingService: TransactionProcessingService,
    private readonly sharedService: SharedService,
    private usersService: UsersService,) {}

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
    const businessNumber = request.user?.businessNumber;
    console.log('User Firebase ID:', userId);
    console.log('User Business Number:', businessNumber);
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
    return this.transactionsService.getSourcesWithTypes(userId);
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
