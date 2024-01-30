import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
import { query } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import * as tesseract from 'tesseract.js';

//DTOs
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

//Guards
import { AdminGuard } from 'src/guards/admin.guard';


@Controller('expenses')
//@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private authService: AuthService) {}


  @Post('add')
  async addExpense(@Body() body: CreateExpenseDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    console.log("body of expense :", body);
    console.log("user id in addExpense :", userId);
    return await this.expensesService.addExpense(body, userId); 
  } 
  catch (error) {
    console.log("משתמש לא חוקי");
    console.log("this is errorrrrrrrr :",error);
    return {message: "invalid user"};  
  }


  @Patch('update-expense/:id')
  async updateExpense(@Param('id') id: number, @Body() body: UpdateExpenseDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    console.log("controller update expense - Start");
    console.log("body of update expense :", body);
    return this.expensesService.updateExpense(id, userId, body);
  }


  @Delete('delete-expense/:id')
  async deleteExpense(@Param('id') id: number, @Body() body: UpdateExpenseDto) {
    console.log("controller delete expense - Start");
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return this.expensesService.deleteExpense(id, userId);
  }


  @Post('add-default-category')
  @UseGuards(AdminGuard)
  async addDefaultCategory(@Body() body: CreateCategoryDto) {
    return await this.expensesService.addDefaultCategory(body); 
  } 

 
}