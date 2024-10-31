//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, Headers, UseGuards, UploadedFile, UseInterceptors, NotFoundException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
//Entities
import { Expense } from './expenses.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
//import { DefaultCategory } from './categories.entity';
//Services
import { ExpensesService } from './expenses.service';
import { UsersService } from '../users/users.service';
import { SharedService } from '../shared/shared.service';
//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
//Guards
import { AdminGuard } from '../guards/admin.guard';

import { parse } from 'date-fns';
import { getDayOfYear } from 'date-fns';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
import { DefaultCategory } from './default-categories.entity';


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
    @Query('isSingleMonth') isSingleMonth: string,
    @Query('monthReport') monthReport: number
  ) {
    const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
    const singleMonth = isSingleMonth === 'true' ? true : false;

    // Validate that monthReport is a valid number
    if (!monthReport || monthReport < 1 || monthReport > 12) {
      throw new BadRequestException('Invalid monthReport. It must be a number between 1 and 12.');
    }
    return await this.expensesService.getExpensesForVatReport(firebaseId, singleMonth, monthReport);
  }


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Categories            /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-user-category')
  async addUserCategory(
  @Headers('token') token: string,
  @Body() createUserCategoryDto: CreateUserCategoryDto) {
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
    return this.expensesService.getCategories(isDefaultValue, firebaseId);
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

    // Call the service method to get the sub-categories
    return this.expensesService.getSubCategories(firebaseId, isEquipmentValue, categoryName);
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
  async updateSupplier(@Param('id') id: number, @Body() body: UpdateSupplierDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return this.expensesService.updateSupplier(id, userId, body);
  }


  @Delete('delete-supplier/:id')
  async deleteSupplier(@Param('id') id: number, @Query('token') token: string) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.deleteSupplier(id, userId);
  }


  @Get('get-suppliers-list')
  async getSupplierNamesByUserId(@Query('token') token: string): Promise<SupplierResponseDto[]> {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.expensesService.getSupplierNamesByUserId(userId);
  }


  @Get('get-supplier/:id')
  async getSupplierById(@Param('id') id: number, @Body() body: UpdateSupplierDto): Promise<SupplierResponseDto> {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return this.expensesService.getSupplierById(id, userId);
  }





 
}