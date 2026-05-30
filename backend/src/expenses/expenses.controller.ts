//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, Headers, UseGuards, UploadedFile, UseInterceptors, NotFoundException, HttpException, HttpStatus, BadRequestException, ForbiddenException } from '@nestjs/common';
//Entities
import { Expense } from './expenses.entity';
//Services
import { ExpensesService, BulkConfirmFromDriveItem } from './expenses.service';
import { UsersService } from '../users/users.service';
import { SharedService } from '../shared/shared.service';
//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
import { UpdateUserCategoryDto } from './dtos/update-user-category.dto';
import { UpdateUserSubCategoryDto } from './dtos/update-user-sub-category.dto';
//Guards
import { AdminGuard } from '../guards/admin.guard';
import { GetExpensesDto } from './dtos/get-expenses.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { CreateUserSubCategoryDto } from './dtos/create-user-sub-category.dto';
import { ExpenseReportScope } from 'src/enum';


@Controller('expenses')
//@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private usersService: UsersService,
    private sharedService: SharedService) { }


  @Post('add-expense')
  @UseGuards(FirebaseAuthGuard)
  async addExpense(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateExpenseDto) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    const res = await this.expensesService.addExpense(body, firebaseId, businessNumber);
    return res;
  }


  @Post('bulk-confirm-from-drive')
  @UseGuards(FirebaseAuthGuard)
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


  @Patch('update-expense/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: any) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.updateExpense(id, firebaseId, body);
  }


  @Delete('delete-expense/:id')
  @UseGuards(FirebaseAuthGuard)
  async deleteExpense(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number) {
    console.log("controller delete expense - Start");
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.deleteExpense(id, firebaseId);
  }


  @Get('get_by_userID')
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
  async getExpensesByMonthReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: any,
  ) {
    const firebaseId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return await this.expensesService.getExpensesForVatReport(firebaseId, query.businessNumber, startDate, endDate);
  }


  @Patch('add-file-to-expense')
  @UseGuards(FirebaseAuthGuard)
  async addFileToExpense(
    @Req() request: AuthenticatedRequest,
    @Body() body: { files: { id: number; file: string | null }[]; fromTransactions: boolean }) {
    const { files, fromTransactions } = body;
    const firebaseId = request.user?.firebaseId;
    return await this.expensesService.saveFileToExpenses(files, firebaseId, fromTransactions);

  }

  @Patch('delete-file-from-expense/:id')
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
  async addUserCategory(
    @Req() request: AuthenticatedRequest,
    @Body() createUserCategoryDto: CreateUserCategoryDto) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return this.expensesService.addUserCategory(firebaseId, createUserCategoryDto, businessNumber);
  }


  @Post('add-user-sub-categories')
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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

  @Get('get-all-default-sub-categories')
  @UseGuards(FirebaseAuthGuard)
  async getAllDefaultSubCategories(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    // if (!isAdmin) {
    //   throw new ForbiddenException('Admin access required');
    // }
    return this.expensesService.getAllDefaultSubCategories();
  }

  @Patch('update-default-sub-category/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateDefaultSubCategory(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const firebaseId = request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.expensesService.updateDefaultSubCategory(Number(id), body);
  }

  @Post('add-default-sub-category')
  @UseGuards(FirebaseAuthGuard)
  async addDefaultSubCategory(@Req() request: AuthenticatedRequest, @Body() body: any) {
    const firebaseId = request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.expensesService.createDefaultSubCategory(body);
  }

  @Delete('delete-default-sub-category/:id')
  @UseGuards(FirebaseAuthGuard)
  async deleteDefaultSubCategory(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const firebaseId = request.user?.firebaseId;
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    await this.expensesService.deleteDefaultSubCategory(Number(id));
  }


  ///////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////               Suppliers             /////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-supplier')
  @UseGuards(FirebaseAuthGuard)
  async addSupplier(
    @Req() request: AuthenticatedRequest,
    @Body() body: any) {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return await this.expensesService.addSupplier(body, firebaseId, businessNumber);
  }


  @Patch('update-supplier/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateSupplier(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number,
    @Body() body: UpdateSupplierDto) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.updateSupplier(id, firebaseId, body);
  }


  @Delete('delete-supplier/:id')
  @UseGuards(FirebaseAuthGuard)
  async deleteSupplier(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: number) {
    const firebaseId = request.user?.firebaseId;
    return this.expensesService.deleteSupplier(id, firebaseId);
  }


  @Get('get-suppliers-list')
  @UseGuards(FirebaseAuthGuard)
  async getSupplierNamesByUserId(
    @Req() request: AuthenticatedRequest,
  ): Promise<SupplierResponseDto[]> {
    const firebaseId = request.user?.firebaseId;
    const businessNumber = request.user?.businessNumber;
    return this.expensesService.getSupplierNamesByUserId(firebaseId, businessNumber);
  }


  @Get('get-supplier/:id')
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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
  @UseGuards(FirebaseAuthGuard)
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