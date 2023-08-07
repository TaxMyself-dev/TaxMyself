import { Controller, Post, Patch, Get, Query, Param, Body, UseGuards } from '@nestjs/common';
import { CreateExpenseDto } from './dtos/create-expense.dto';
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

    @Get('/:id')
    async getAllExpenses(@Param('id') id: string): Promise<Expense[]> {
        const expenses_list = await this.expensesService.findAllByUserId(id)
        return expenses_list;
    }

}
