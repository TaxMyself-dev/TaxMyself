import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Expense } from './expenses.entity';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { User } from 'src/users/user.entity';
import { GetExpenseDto } from './dtos/get-expense.dto';

@Injectable()
export class ExpensesService {
    constructor(
        @InjectRepository(Expense) private repo: Repository<Expense>
    ) {}

    // async addExpense(expense: Partial<Expense>, userId: string): Promise<Expense> {
    //     const newExpense = this.repo.create(expense);
    //     newExpense.user = { id: userId } as any;
    //     return await this.repo.save(newExpense);
    // }

    async addTempExpense(createExpenseDto: CreateExpenseDto): Promise<CreateExpenseDto> {
        console.log(createExpenseDto);
        const expense = this.repo.create(createExpenseDto);
        return await this.repo.save(expense);
        return createExpenseDto;
    }

    async getExpensesBySupplier(supplier: string): Promise<Expense[]> {
        return await this.repo.find({ where: { supplier: supplier } });
    }

    async getExpensesWithinDateRange(startDate: string, endDate: string): Promise<Expense[]> {
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        return await this.repo.find({
            where: {
                date: Between(parsedStartDate, parsedEndDate),
            },
        });
    }
   

    //async addTempExpense(expense: CreateExpenseDto) {
    //    console.log(expense);
        
        //const newExpense = this.repo.create(expense);
        //newExpense.user = { id: userId } as any;
        //return await this.repo.save(newExpense);
        //return expense;
    //}

    // create(exportDto: CreateExpenseDto, userId: string) {
    //     const expense = this.repo.create(exportDto);
    //     expense.user = userId;
    //     return this.repo.save(expense);
    // }

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
