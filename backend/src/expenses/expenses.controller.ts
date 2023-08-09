import { Controller, Post, Patch, Get, Delete, Query, Param, Body, UseGuards } from '@nestjs/common';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { GetExpenseDto } from './dtos/get-expense.dto';
import { ExpensesService } from './expenses.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { CurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/user.entity';
import { ExpenseDto } from './dtos/expense.dto';
import { Expense } from './expenses.entity';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { AdminGuard } from 'src/guards/admin.guard';
import { query } from 'express';

@Controller('expenses')
export class ExpensesController {
    constructor(private expensesService: ExpensesService) {}

    @Post()
    @UseGuards(AuthGuard)
    @Serialize(ExpenseDto)
    createExpense(@Body() body: CreateExpenseDto, @CurrentUser() user: User) {
        return this.expensesService.create(body, user);
    }

    @Get()
    async getAllExpenses(@Query() query: GetExpenseDto) {
        const expenses_list = await this.expensesService.getUserExpensesByDates(query);
        //console.log(expenses_list);
        return this.expensesService.getSumOfExpenses(expenses_list);
    }

    @Delete('/:id')
    removeExpense(@Param('id') id: string) {
        return this.expensesService.remove(parseInt(id));
    }

}
