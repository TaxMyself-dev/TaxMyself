import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards } from '@nestjs/common';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { GetExpenseDto } from './dtos/get-expense.dto';
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
import { UsersService } from 'src/users/users.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { CurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/user.entity';
import { ExpenseDto } from './dtos/expense.dto';
import { Expense } from './expenses.entity';
import { Supplier } from './supplier.entity';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { AdminGuard } from 'src/guards/admin.guard';
import { query } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { request } from 'http';
//import { FirebaseService } from './firebase.service';



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
    

  // @Post('add_supplier')
  // async addSupplier(@Body() body: CreateSupplierDto) {
  //   //Add getUserIdFromToken()
  //   const userId = "yh1ovqmsP2O6gAdYtMlBbw"
  //   console.log(body);
  //   console.log(userId);
  //   return await this.expensesService.addSupplier(body, userId);
  // }

  // @Get('get_supplier')
  // async getSupplier(@Query('name') name: string) {
  //   //Add getUserIdFromToken()
  //   const userId = "yh1ovqmsP2O6gAdYtMlBbw"
  //   console.log(name);
  //   console.log(userId);
  //   return await this.expensesService.getSupplier(name, userId);
  // }

  @Get('get_by_supplier')
  async getExpensesBySupplier(@Query('supplier') supplier: string): Promise<Expense[]> {
    return await this.expensesService.getExpensesBySupplier(supplier);
  }

  @Get('get_by_userID')
  async getExpensesByUserID(@Query('userID') userID: string): Promise<Expense[]> {
    console.log("this is user id that i send: ", userID);
    
    return await this.expensesService.getExpensesByUserID(userID);
  }

  @Get('get_by_date')
  async getExpensesWithinDateRange(@Query('startDate') startDate: string, @Query('endDate') endDate: string): Promise<Expense[]> {
    return await this.expensesService.getExpensesWithinDateRange(startDate, endDate);
  }


}
