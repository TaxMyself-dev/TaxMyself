//General
import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
//Entities
import { Expense } from './expenses.entity';
import { DefaultCategory } from './categories.entity';
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


import { query } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import * as tesseract from 'tesseract.js';
import { throwError } from 'rxjs';

@Controller('expenses')
//@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private authService: AuthService) { }


  @Post('add-expense')
  async addExpense(@Body() body: CreateExpenseDto) {
    try {      
      console.log("nbhjbklmmlkjlkmm");
      const userId = await this.authService.getFirbsaeIdByToken(body.token)
      console.log("afterafter");
      console.log("body of expense :", body);
      console.log("user id in addExpense :", userId);
      const res = await this.expensesService.addExpense(body, userId);
      return res;
    }
    catch (error) {
      console.log("invalid user");
      console.log("this is errorrrrrrrr :", error);
      throw new NotFoundException(error.message);
    }
  }


  @Patch('update-expense/:id')
  async updateExpense(@Param('id') id: number, @Body() body: any) {
    console.log("in update");
    
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    console.log("controller update expense - Start");
    console.log("body of update expense :", body);
    return this.expensesService.updateExpense(id, userId, body);
  }


  @Delete('delete-expense/:id')
  async deleteExpense(@Param('id') id: number, @Query('token') token: string) {
    console.log("controller delete expense - Start");
    console.log(token);
    
    const userId = await this.authService.getFirbsaeIdByToken(token)
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


  @Get('get-categories-list')
  async getAllCategories(): Promise<string[]> {
    return this.expensesService.getAllCategories();
  }


  @Get('get-sub-categories-list')
  async getSubCategoriesByCategory(@Query('category') category: string): Promise<DefaultCategory[]> {
    return this.expensesService.getSubcategoriesByCategory(category);
  }


///////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////               Suppliers             /////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////


  @Post('add-supplier')
  async addSupplier(@Body() body: CreateSupplierDto) {
    console.log("add supplier call", body);
    
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return await this.expensesService.addSupplier(body, userId); 
  } 
  catch (error) {
    return {message: "invalid user"};  
  }


  @Patch('update-supplier/:id')
  async updateSupplier(@Param('id') id: number, @Body() body: UpdateSupplierDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return this.expensesService.updateSupplier(id, userId, body);
  }


  @Delete('delete-supplier/:id')
  async deleteSupplier(@Param('id') id: number, @Body() body: UpdateSupplierDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return this.expensesService.deleteSupplier(id, userId);
  }


  @Get('get-suppliers-list')
  async getSupplierNamesByUserId(@Query('token') token: string): Promise<SupplierResponseDto[]> {
    console.log(token);
    const userId = await this.authService.getFirbsaeIdByToken(token)
    return this.expensesService.getSupplierNamesByUserId(userId);
  }


  @Get('get-supplier/:id')
  async getSupplierById(@Param('id') id: number, @Body() body: UpdateSupplierDto): Promise<SupplierResponseDto> {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return this.expensesService.getSupplierById(id, userId);
  }





 
}