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


@Controller('expenses')
//@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private usersService: UsersService,
    private sharedService: SharedService) {}

  @Post('add-expense')
  async addExpense(@Body() body: CreateExpenseDto) {
      const userId = await this.usersService.getFirbsaeIdByToken(body.token);
      const res = await this.expensesService.addExpense(body, userId);
      return res;
  }


  @Patch('update-expense/:id')
  async updateExpense(@Param('id') id: number, @Body() body: any) {
    console.log("in update");
    
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    console.log("controller update expense - Start");
    console.log("body of update expense :", body);
    return this.expensesService.updateExpense(id, userId, body);
  }


  @Delete('delete-expense/:id')
  async deleteExpense(@Param('id') id: number, @Query('token') token: string) {
    console.log("controller delete expense - Start");
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.deleteExpense(id, userId);
  }

  @Get('get_by_userID')
  async getExpensesByUserID(@Query('userID') userID: string): Promise<Expense[]> {
    console.log("this is user id that i send: ", userID);
    return await this.expensesService.getExpensesByUserID(userID);
  }


  @Get('get-expenses-for-vat-report')
  async getExpensesByMonthReport(
    @Headers('token') token: string,
    @Query() query: any,
  ) {
    const firebaseId = await this.usersService.getFirbsaeIdByToken(token);    
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
   
    return await this.expensesService.getExpensesForVatReport(firebaseId, startDate, endDate);
  }


  @Patch('add-file-to-expense')
  async addFileToExpense(@Headers('token') token: string,
    @Body() expensesData: {id: number, file: string | null}[]) {
      const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
     return await this.expensesService.saveFileToExpenses(expensesData, firebaseId);

    }


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Categories            /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-user-category')
  async addUserCategory(
  @Headers('token') token: string,
  @Body() createUserCategoryDto: CreateUserCategoryDto) {
    console.log("controller: add-user-category");
    const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
    return this.expensesService.addUserCategory(firebaseId, createUserCategoryDto);
  }


  @Get('get-categories')
  async getCategories(
    @Headers('token') token: string,
    @Query('isDefault') isDefault: string
  ): Promise<any[]> {
    console.log("get-categories");
    const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
    const isDefaultValue = isDefault === 'true' ? true : isDefault === 'false' ? false : null;
    const isExpense = false;

    return this.expensesService.getCategories(isDefaultValue, isExpense, firebaseId);
  }


  @Get('get-sub-categories')
  async getSubCategories(
    @Headers('token') token: string,
    @Query('isEquipment') isEquipment: string,
    @Query('categoryName') categoryName: string
  ): Promise<any[]> {

    const firebaseId = await this.usersService.getFirbsaeIdByToken(token);

    // Convert isEquipment to boolean or null
    const isEquipmentValue = isEquipment === 'true' ? true : isEquipment === 'false' ? false : null;
    const isExpense = true;

    // Call the service method to get the sub-categories
    return this.expensesService.getSubCategories(firebaseId, isEquipmentValue, isExpense, categoryName);
  }


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Suppliers             /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-supplier')
  async addSupplier(@Body() body: any, @Headers('token') token: string) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return await this.expensesService.addSupplier(body, userId); 
  } 


  @Patch('update-supplier/:id')
  async updateSupplier(@Param('id') id: number, @Headers('token') token: string, @Body() body: UpdateSupplierDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.updateSupplier(id, userId, body);
  }


  @Delete('delete-supplier/:id')
  async deleteSupplier(@Param('id') id: number, @Query('token') token: string) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.deleteSupplier(id, userId);
  }


  @Get('get-suppliers-list')
  async getSupplierNamesByUserId(@Headers('token') token: string): Promise<SupplierResponseDto[]> {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.getSupplierNamesByUserId(userId);
  }


  @Get('get-supplier/:id')
  async getSupplierById(@Param('id') id: number, @Headers('token') token: string, @Body() body: UpdateSupplierDto): Promise<SupplierResponseDto> {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.getSupplierById(id, userId);
  }





 
}