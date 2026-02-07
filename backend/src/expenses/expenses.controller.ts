//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, Headers, UseGuards, UploadedFile, UseInterceptors, NotFoundException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
//Entities
import { Expense } from './expenses.entity';
//Services
import { ExpensesService } from './expenses.service';
import { UsersService } from '../users/users.service';
import { SharedService } from '../shared/shared.service';
//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
//Guards
import { AdminGuard } from '../guards/admin.guard';
import { GetExpensesDto } from './dtos/get-expenses.dto';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { CreateUserSubCategoryDto } from './dtos/create-user-sub-category.dto';


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
    let startDate: Date;
    let endDate: Date;

    if (query.startDate) {
      startDate = this.sharedService.convertStringToDateObject(query.startDate);
    }
    if (query.endDate) {
      endDate = this.sharedService.convertStringToDateObject(query.endDate);
    }
    return await this.expensesService.getExpensesByUserID(firebaseId, startDate, endDate, query.businessNumber, Number(query.pagination));
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
    @Query('categoryName') categoryName: string
  ): Promise<any[]> {

    const businessNumber = request.user?.businessNumber;
    const firebaseId = request.user?.firebaseId;

    // Convert isEquipment to boolean or null
    const isEquipmentValue = isEquipment === 'true' ? true : isEquipment === 'false' ? false : null;
    const isExpenseValue = isExpense === 'true' ? true : isExpense === 'false' ? false : null;

    // Call the service method to get the sub-categories
    return this.expensesService.getSubCategories(firebaseId, isEquipmentValue, isExpenseValue, categoryName, businessNumber);
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
    return await this.expensesService.addSupplier(body, firebaseId);
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
    console.log("🚀 ~ ExpensesController ~ getSupplierNamesByUserId ~ firebaseId:", firebaseId)
    const businessNumber = request.user?.businessNumber;
    console.log("🚀 ~ ExpensesController ~ getSupplierNamesByUserId ~ businessNumber:", businessNumber)
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


}