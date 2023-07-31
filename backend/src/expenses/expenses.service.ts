import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './expenses.entity';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { User } from 'src/users/user.entity';

@Injectable()
export class ExpensesService {
    constructor(
        @InjectRepository(Expense) private repo: Repository<Expense>
    ) {}

    create(exportDto: CreateExpenseDto, user: User) {
        const expense = this.repo.create(exportDto);
        expense.user = user;
        return this.repo.save(expense);
    }

    
    async findAllByUserId(id: string): Promise<Expense[]> {
        const expenses_list = await this.repo.find({ where: { id: parseInt(id) } });

        if (!expenses_list) {
            throw new NotFoundException('expenses not found');
        }
        else {
            console.log("expenses were fuond");
            console.log(expenses_list)
        }

        return expenses_list;
    }

}
