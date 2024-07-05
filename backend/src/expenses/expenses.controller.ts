//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
//Entities
import { Expense } from './expenses.entity';
import { DefaultCategory } from './categories.entity';
//Services
import { ExpensesService } from './expenses.service';
import { UsersService } from 'src/users/users.service';
import { SharedService } from 'src/shared/shared.service';
//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
//Guards
import { AdminGuard } from 'src/guards/admin.guard';

import { parse } from 'date-fns';
import { getDayOfYear } from 'date-fns';


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


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Categories            /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-default-category')
  @UseGuards(AdminGuard)
  async addDefaultCategory(@Body() body: CreateCategoryDto) {
    return await this.expensesService.addDefaultCategory(body); 
  }
  

  @Post('add-user-category')
  async addUserCategory(@Body() body: CreateCategoryDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return await this.expensesService.addUserCategory(body, userId); 
  } 


  @Get('get-categories-list')
  async getAllCategories(@Query('isEquipment') isEquipment: boolean): Promise<string[]> {
    return this.expensesService.getAllCategories(isEquipment);
  }


  @Get('get-sub-categories-list')
  async getSubCategoriesByCategory(
          @Query('category') categoryQuery: string,
          @Query('isEquipment') isEquipmentQuery: boolean,
        ): Promise<DefaultCategory[]> {
    return this.expensesService.getSubcategoriesByCategory(categoryQuery, isEquipmentQuery);
  }


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Suppliers             /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-supplier')
  async addSupplier(@Body() body: any) {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return await this.expensesService.addSupplier(body, userId, body.name); 
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