import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards } from '@nestjs/common';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { GetExpenseDto } from './dtos/get-expense.dto';
import { ExpensesService } from './expenses.service';
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


@Controller('expenses')
@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
    constructor(private expensesService: ExpensesService) {}

    @Post('add')
    async addExpense(@Body() body: CreateExpenseDto) {
      const userId = "yh1ovqmsP2O6gAdYtMlBbw"
      console.log(body);
      console.log(userId);
      return await this.expensesService.addExpense(body, userId);
    }

    // @Post('/new')
    // async addExpense(
    //   @Body() expense: Partial<Expense>,
    //   @Req() request: any,
    // ): Promise<Expense> {
    //   const userId = request.user.uid;
    //   return await this.expensesService.addExpense(expense, userId);
    // }

    // @Post('/add')
    // examCreate(@Body() body: any){
    //     console.log(body);
    //     return body;
    // }

    @Post('/add')
    async create(@Body() createExpenseDto: CreateExpenseDto) {
    //async create(@Body() createExpenseDto: any) {
      console.log("my expense:", createExpenseDto);
      return this.expensesService.create(createExpenseDto);
    }

    //async addTempExpense(@Body() createExpenseDto: CreateExpenseDto): Promise<CreateExpenseDto> {
      async addTempExpense(@Body() body: any) {
      console.log("add!!!!");
      console.log("my body is:", body);
      
      //console.log(createExpenseDto);
      //console.log(createExpenseDto.price);
      //return await this.expensesService.addTempExpense(createExpenseDto);
    }

    @Get('get_by_supplier')
    async getExpensesBySupplier(@Query('supplier') supplier: string): Promise<Expense[]> {
      return await this.expensesService.getExpensesBySupplier(supplier);
    }

    @Get('get_by_date')
    async getExpensesWithinDateRange(@Query('startDate') startDate: string, @Query('endDate') endDate: string): Promise<Expense[]> {
      return await this.expensesService.getExpensesWithinDateRange(startDate, endDate);
    }

}
