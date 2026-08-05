//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, Headers, UseGuards, UploadedFile, UseInterceptors, NotFoundException, HttpException, HttpStatus, BadRequestException, ForbiddenException } from '@nestjs/common';
//Entities
import { Expense } from './expenses.entity';
//Services
import { ExpensesService, BulkConfirmFromDriveItem, DuplicateExpenseCheckItem } from './expenses.service';
import { UsersService } from '../users/users.service';
import { SharedService } from '../shared/shared.service';
//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
import { UpdateUserCategoryDto } from './dtos/update-user-category.dto';
import { UpdateUserSubCategoryDto } from './dtos/update-user-sub-category.dto';
import { ReclassifyExpenseDto, OverrideExpenseMappingDto, CompleteExpenseMappingDto } from './dtos/reclassify-expense.dto';
//Guards
import { AdminGuard } from '../guards/admin.guard';
import { GetExpensesDto } from './dtos/get-expenses.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { SubscriptionGuard } from 'src/guards/subscription.guard';
import { RequireModule } from 'src/decorators/require-module.decorator';
import { CreateUserSubCategoryDto } from './dtos/create-user-sub-category.dto';
import { ExpenseReportScope, ModuleName } from 'src/enum';


@Controller('expenses')
@RequireModule(ModuleName.EXPENSES)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private usersService: UsersService,
    private sharedService: SharedService) { }


  @Post('add-expense')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async addExpense(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateExpenseDto) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    const res = await this.expensesService.addExpense(body, firebaseId, businessNumber);
    return res;
  }


  @Post('bulk-confirm-from-drive')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async bulkConfirmFromDrive(
    @Req() request: AuthenticatedRequest,
    @Body() body: { businessNumber?: string; items: BulkConfirmFromDriveItem[] },
  ) {
    const firebaseId = request.user?.firebaseId;
    // Prefer body.businessNumber (dialog sends it explicitly) and fall back to
    // the businessnumber header set by AuthInterceptor (legacy contract).
    const businessNumber = body?.businessNumber?.trim() || request.user?.businessNumber;
    if (!firebaseId) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    if (!businessNumber) throw new HttpException('businessNumber is required (body or header)', HttpStatus.BAD_REQUEST);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      throw new BadRequestException('items[] is required');
    }
    return this.expensesService.bulkConfirmFromDrive(firebaseId, businessNumber, items);
  }


  /**
   * Pre-flight duplicate check for the drive-extract confirm flow. The UI
   * calls this before bulk-confirm so users see "this expense already exists
   * in period X/YYYY" and can deselect the offending rows instead of silently
   * double-booking. The check is supplier+sum+date exact-match; not a fuzzy
   * heuristic (see service comment for the tradeoff).
   */
  @Post('check-duplicates-from-drive')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async checkDuplicatesFromDrive(
    @Req() request: AuthenticatedRequest,
    @Body() body: { businessNumber?: string; items: DuplicateExpenseCheckItem[] },
  ) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = body?.businessNumber?.trim() || request.user?.businessNumber;
    if (!firebaseId) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    if (!businessNumber) throw new HttpException('businessNumber is required (body or header)', HttpStatus.BAD_REQUEST);
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.expensesService.checkDuplicateExpensesFromDrive(firebaseId, businessNumber, items);
  }


  /** Phase 4.2 (D10): full reclassification onto a different sub_category —
   *  card law only. Stamps classificationOverrideByUserId with the ACTOR's
   *  own id (the accountant's, not the impersonated client's). */
  @Patch(':id/reclassify')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async reclassifyExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: ReclassifyExpenseDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    const actorFirebaseId = request.user?.actorFirebaseId ?? firebaseId;
    return this.expensesService.reclassifyExpense(id, firebaseId, actorFirebaseId, body.subCategoryId);
  }

  /** Phase 4.2 (D10): mapping-only override — keep the sub_category, point
   *  the accounting snapshots at an explicitly-chosen card. */
  @Patch(':id/override-mapping')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async overrideExpenseMapping(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: OverrideExpenseMappingDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    const actorFirebaseId = request.user?.actorFirebaseId ?? firebaseId;
    return this.expensesService.overrideExpenseMapping(id, firebaseId, actorFirebaseId, body);
  }

  /** Phase 5.3 (D9's inline completion row): complete a missing accounting
   *  mapping. applyToFuture=true repoints the sub_category (future expenses
   *  follow) and re-resolves this expense; false = one-off override only. */
  @Post(':id/complete-mapping')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async completeExpenseMapping(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: CompleteExpenseMappingDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    const actorFirebaseId = request.user?.actorFirebaseId ?? firebaseId;
    return this.expensesService.completeExpenseMapping(id, firebaseId, actorFirebaseId, body);
  }

  @Patch('update-expense/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async updateExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: any) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.updateExpense(id, firebaseId, body);
  }


  @Delete('delete-expense/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async deleteExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number) {
    console.log("controller delete expense - Start");
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.deleteExpense(id, firebaseId);
  }


  @Get('get_by_userID')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getExpensesByUserID(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetExpensesDto): Promise<Expense[]> {
    const firebaseId = request.user?.firebaseId;
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.startDate) {
      startDate = this.sharedService.convertStringToDateObject(query.startDate);
    }
    if (query.endDate) {
      const end = this.sharedService.convertStringToDateObject(query.endDate);
      endDate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));
    }

    // לוג: ערכים שמגיעים מהפרונט
    console.log('[get_by_userID] בקשה מהפרונט:', {
      queryRaw: { startDate: query.startDate, endDate: query.endDate, businessNumber: query.businessNumber, pagination: query.pagination },
      firebaseId: firebaseId ?? '(חסר)',
      startDate: startDate?.toISOString?.() ?? '(לא הוגדר)',
      endDate: endDate?.toISOString?.() ?? '(לא הוגדר)',
      businessNumber: query.businessNumber ?? '(ריק/לא נשלח)',
    });

    const result = await this.expensesService.getExpensesByUserID(firebaseId, startDate, endDate, query.businessNumber, Number(query.pagination));

    // לוג: הוצאות שהתקבלו
    console.log('[get_by_userID] הוצאות שהתקבלו:', result.length, 'פריטים. ids:', result.map((e) => e.id).join(', ') || '(אין)');

    return result;
  }


  @Get('get-expenses-for-vat-report')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getExpensesByMonthReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: any,
  ) {
    const firebaseId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const expenses = await this.expensesService.getExpensesForVatReport(firebaseId, query.businessNumber, startDate, endDate);
    // The AMOUNT_WITH_PERCENT table cell renderer (generic-table.component.ts)
    // reads `vatPercent`/`taxPercent` off each row — alias them here from the
    // entity's `*Snapshot` columns so the frontend percent lines aren't stuck at 0.
    return expenses.map((e) => ({
      ...e,
      vatPercent: Number(e.vatPercentSnapshot) || 0,
      taxPercent: Number(e.taxPercentSnapshot) || 0,
    }));
  }


  @Patch('add-file-to-expense')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async addFileToExpense(
    @Req() request: AuthenticatedRequest,
    @Body() body: { files: { id: number; file: string | null }[]; fromTransactions: boolean }) {
    const { files, fromTransactions } = body;
    const firebaseId = request.user?.firebaseId;
    return await this.expensesService.saveFileToExpenses(files, firebaseId, fromTransactions);

  }

  @Patch('delete-file-from-expense/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async deleteFileFromExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') expenseId: string
  ) {
    const firebaseId = request.user?.firebaseId;
    return await this.expensesService.deleteFileFromExpense(Number(expenseId), firebaseId);
  }


  ///////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////               Categories            /////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-user-category')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async addUserCategory(
    @Req() request: AuthenticatedRequest,
    @Body() createUserCategoryDto: CreateUserCategoryDto) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return this.expensesService.addUserCategory(firebaseId, createUserCategoryDto, businessNumber);
  }


  @Post('add-user-sub-categories')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async addUserSubCategories(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateUserCategoryDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    const { categoryName, subCategories } = body;

    if (!categoryName) {
      throw new BadRequestException('categoryName is required');
    }

    if (!subCategories?.length) {
      throw new BadRequestException('subCategories are required');
    }

    return this.expensesService.addUserSubCategories(
      firebaseId,
      businessNumber,
      categoryName,
      subCategories,
    );
  }


  @Get('get-categories')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getCategories(
    @Req() request: AuthenticatedRequest,
    @Query('isDefault') isDefault: string,
    @Query('isExpense') isExpense: string,
  ): Promise<any[]> {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;

    // Convert isDefault to boolean or null
    const isDefaultValue = isDefault === 'true' ? true : isDefault === 'false' ? false : null;
    const isExpenseValue = isExpense === 'true' ? true : isExpense === 'false' ? false : null;

    return this.expensesService.getCategories(isDefaultValue, isExpenseValue, firebaseId, businessNumber);
  }


  @Get('get-sub-categories')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getSubCategories(
    @Req() request: AuthenticatedRequest,
    @Query('isEquipment') isEquipment: string,
    @Query('isExpense') isExpense: string,
    @Query('categoryName') categoryName: string,
    @Query('businessNumber') businessNumberFromQuery?: string,
  ): Promise<any[]> {

    const headerBn = request.user?.businessNumber;
    const businessNumber =
      headerBn && String(headerBn).trim() !== ''
        ? headerBn
        : businessNumberFromQuery && String(businessNumberFromQuery).trim() !== ''
          ? businessNumberFromQuery
          : null;
    const firebaseId = request.user?.firebaseId;

    // Convert isEquipment to boolean or null
    const isEquipmentValue = isEquipment === 'true' ? true : isEquipment === 'false' ? false : null;
    const isExpenseValue = isExpense === 'true' ? true : isExpense === 'false' ? false : null;

    // Call the service method to get the sub-categories
    return this.expensesService.getSubCategories(firebaseId, isEquipmentValue, isExpenseValue, categoryName, businessNumber);
  }

  // SYSTEM-catalog admin endpoints (D11/5.1: only a platform admin edits
  // SYSTEM rows — accountants get their own ACCOUNTANT layer instead). The
  // admin check runs against actorFirebaseId — the caller's OWN identity —
  // so an admin browsing while impersonating a client (x-client-user-id
  // swaps firebaseId) is still recognized, and an accountant impersonating
  // a client is still refused.

  @Get('get-all-default-sub-categories')
  @UseGuards(FirebaseAuthGuard)
  async getAllDefaultSubCategories(@Req() request: AuthenticatedRequest) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(actorFirebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.expensesService.getAllDefaultSubCategories();
  }

  @Patch('update-default-sub-category/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateDefaultSubCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(actorFirebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.expensesService.updateDefaultSubCategory(Number(id), body);
  }

  @Post('add-default-sub-category')
  @UseGuards(FirebaseAuthGuard)
  async addDefaultSubCategory(@Req() request: AuthenticatedRequest, @Body() body: any) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(actorFirebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.expensesService.createDefaultSubCategory(body);
  }

  @Delete('delete-default-sub-category/:id')
  @UseGuards(FirebaseAuthGuard)
  async deleteDefaultSubCategory(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const actorFirebaseId = request.user?.actorFirebaseId ?? request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(actorFirebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    await this.expensesService.deleteDefaultSubCategory(Number(id));
  }


  ///////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////               Suppliers             /////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-supplier')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async addSupplier(
    @Req() request: AuthenticatedRequest,
    @Body() body: any) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return await this.expensesService.addSupplier(body, firebaseId, businessNumber);
  }


  @Patch('update-supplier/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async updateSupplier(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: UpdateSupplierDto) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.updateSupplier(id, firebaseId, body);
  }


  @Delete('delete-supplier/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async deleteSupplier(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.deleteSupplier(id, firebaseId);
  }


  @Get('get-suppliers-list')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getSupplierNamesByUserId(
    @Req() request: AuthenticatedRequest,
  ): Promise<SupplierResponseDto[]> {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return this.expensesService.getSupplierNamesByUserId(firebaseId, businessNumber);
  }


  @Get('get-supplier/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getSupplierById(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: UpdateSupplierDto): Promise<SupplierResponseDto> {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.getSupplierById(id, firebaseId);
  }


  /**
   * List the user's custom categories + sub-categories for a single business,
   * grouped by category name. Powers the "הקטגוריות שלי" tab in Settings.
   */
  @Get('user-categories')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async getUserCategoriesGrouped(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.expensesService.getUserCategoriesGrouped(firebaseId, businessNumber);
  }

  @Delete('user-category/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async deleteUserCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.expensesService.deleteUserCategoryCascade(firebaseId, businessNumber, Number(id));
  }

  @Delete('user-sub-category/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async deleteUserSubCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.expensesService.deleteUserSubCategory(firebaseId, businessNumber, Number(id));
  }

  @Patch('user-category/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async updateUserCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: UpdateUserCategoryDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.expensesService.updateUserCategory(firebaseId, businessNumber, Number(id), dto);
  }

  @Patch('user-sub-category/:id')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async updateUserSubCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: UpdateUserSubCategoryDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber query param is required');
    }
    return this.expensesService.updateUserSubCategory(firebaseId, businessNumber, Number(id), dto);
  }

  /**
   * Subcategory-wide P&L config from the bookkeeping expenses page. Upserts a
   * UserSubCategory override for (categoryName, subCategoryName). Applies to
   * ALL of that subcategory's expenses (P&L resolves pnlCategory live).
   */
  @Post('sub-category-report-config')
  @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
  async setSubCategoryReportConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: {
      businessNumber: string;
      categoryName: string;
      subCategoryName: string;
      reportScope?: ExpenseReportScope;
      pnlCategory?: string | null;
    },
  ) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = body?.businessNumber || request.user?.businessNumber;
    if (!businessNumber) {
      throw new BadRequestException('businessNumber is required');
    }
    return this.expensesService.setSubCategoryReportConfig(
      firebaseId,
      businessNumber,
      body.categoryName,
      body.subCategoryName,
      { reportScope: body.reportScope, pnlCategory: body.pnlCategory },
    );
  }


}