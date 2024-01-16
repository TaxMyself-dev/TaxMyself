import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Expense } from './expenses.entity';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { User } from 'src/users/user.entity';
import { GetExpenseDto } from './dtos/get-expense.dto';
import * as admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import { UpdateExpenseDto } from './dtos/update-expense.dto';


@Injectable()
export class ExpensesService {
    
    constructor
    (
        @InjectRepository(Expense) private expense_repo: Repository<Expense>,
        //@InjectRepository(Supplier) private supplier_repo: Repository<Supplier>

        //@InjectRepository(Supplier) private supplier_repo: Repository<Supplier>
    ) {}



    async addExpense(expense: Partial<Expense>, userId: string): Promise<Expense> {
        console.log("addExpense - start");
        console.log("expense in addEaxpense: ", expense);
        const newExpense = this.expense_repo.create(expense);
        newExpense.userId = userId;
        newExpense.loadingDate = new Date();
        console.log("this is a newExpense :", newExpense);
        console.log("addExpense - end");
        return await this.expense_repo.save(newExpense);
    }

    async updateExpense(id: number, userId: string, updateExpenseDto: UpdateExpenseDto): Promise<Expense> {

        console.log("service update expense - Start");
        console.log("body of update expense :", updateExpenseDto);
        const expense = await this.expense_repo.findOne({ where: { id } });
    
        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        // Check if the user making the request is the owner of the expense
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this expense`);
        }

        return this.expense_repo.save({
            ...expense,
            ...updateExpenseDto,
        });
    
    }

    async deleteExpense(id: number, userId: string): Promise<void> {

        const expense = await this.expense_repo.findOne({ where: { id } });
    
        if (!expense) {
          throw new NotFoundException(`Expense with ID ${id} not found`);
        }
    
        // Check if the user making the request is the owner of the expense
        if (expense.userId !== userId) {
          throw new UnauthorizedException(`You do not have permission to delete this expense`);
        }
    
        // Delete the expense from the database
        await this.expense_repo.remove(expense);

    }

    // async addSupplier(supplier: Partial<Supplier>, userId: string): Promise<Supplier> {
    //     console.log("addSupplier - start");
    //     const newSupplier = this.supplier_repo.create(supplier);
    //     newSupplier.userId = userId;
    //     console.log(newSupplier);
    //     return await this.supplier_repo.save(newSupplier);
    // }

    // async getSupplierDetail(name: string, userid: number): Promise<Supplier | null> {
    //     return await this.supplierRepository.findOne({
    //       where: { name, userid },
    //     });
    //   }

    // async getSupplier(name: string, userId: string): Promise<Supplier> {
    //     console.log("getSupplier - start");
    //     if (!name || !userId) {
    //         console.log("getSupplier - error");
    //         throw new Error('Invalid parameters');
    //       }
    //     return await this.supplier_repo.findOne({
    //         where: { name, userId},
    //     });
    // }

    async getExpensesBySupplier(supplier: string): Promise<Expense[]> {
        return await this.expense_repo.find({ where: { supplier: supplier } });
    }

    async getExpensesByUserID(userId: string): Promise<Expense[]> {
        return await this.expense_repo.find({ where: { userId: userId } });
    }

    async getExpensesWithinDateRange(startDate: string, endDate: string): Promise<Expense[]> {
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        return await this.expense_repo.find({
            where: {
               // date: Between(parsedStartDate, parsedEndDate),
            },
        });
    }

    // async addNewSupplier(createSupplierDto: CreateSupplierDto): Promise<CreateSupplierDto> {
    //     console.log(createSupplierDto);
    //     const supplier = this.supplier_repo.create(createSupplierDto);
    //     return await this.supplier_repo.save(supplier);
    // }
   

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
        return this.expense_repo.findOneBy({id});
    }

    find(id: number) {
        return this.expense_repo.find({ where: {id} })
    }

    async remove(id: number) {
        const expense = await this.findOne(id);
        if (!expense) {
            throw new NotFoundException('expense not found');
        }
        return this.expense_repo.remove(expense);
    }

    // getUserExpensesByDates({userId, price, tax_percent}: GetExpenseDto) {
    //     console.log(userId);
    //     return this.repo
    //     .createQueryBuilder()
    //     .select('*')
    //     .where('userId = :userId', { userId})
    //     //.andWhere('price = :price', { price})
    //     //.andWhere('tax_percent = :tax_percent', { tax_percent})
    //     .getRawMany()
    // }

    getSumOfExpenses(expenses_arr: GetExpenseDto[]): number {
        let sum: number = 0;
        expenses_arr.forEach(element => {
            sum += element.price;
        });
        return sum;
    }

    async findAllByUserId(id: string): Promise<Expense[]> {
        const expenses_list = await this.expense_repo.find({ where: { id: parseInt(id) } });
        return this.expense_repo.find({ where: { id: parseInt(id) } });
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
