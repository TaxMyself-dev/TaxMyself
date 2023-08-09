import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './expenses.entity';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { User } from 'src/users/user.entity';
import { GetExpenseDto } from './dtos/get-expense.dto';

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

    findOne(id: number) {
        if (!id) {
            return null;
        }
        return this.repo.findOneBy({id});
    }

    find(id: number) {
        return this.repo.find({ where: {id} })
    }

    async remove(id: number) {
        const expense = await this.findOne(id);
        if (!expense) {
            throw new NotFoundException('expense not found');
        }
        return this.repo.remove(expense);
    }

    getUserExpensesByDates({userId, price, tax_percent}: GetExpenseDto) {
        console.log(userId);
        return this.repo
        .createQueryBuilder()
        .select('*')
        .where('userId = :userId', { userId})
        //.andWhere('price = :price', { price})
        //.andWhere('tax_percent = :tax_percent', { tax_percent})
        .getRawMany()
    }

    getSumOfExpenses(expenses_arr: GetExpenseDto[]): number {
        let sum: number = 0;
        expenses_arr.forEach(element => {
            sum += element.price;
        });
        return sum;
    }

    async findAllByUserId(id: string): Promise<Expense[]> {
        const expenses_list = await this.repo.find({ where: { id: parseInt(id) } });
        return this.repo.find({ where: { id: parseInt(id) } });
        const variableType1 = typeof id;
        const id1 = parseInt(id);
        const variableType2 = typeof id1;
        console.log('The type of myVariable1 is:', variableType1, "value is ", id);
        console.log('The type of myVariable2 is:', variableType2, "value is ", id1);
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
