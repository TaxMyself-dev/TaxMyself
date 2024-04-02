//General
import { HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository} from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { DefaultCategory } from './categories.entity';
//DTOs
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';


@Injectable()
export class ExpensesService {
    
    constructor
    (
        @InjectRepository(Expense) private expense_repo: Repository<Expense>,
        @InjectRepository(DefaultCategory) private category_repo: Repository<DefaultCategory>,
        @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>
    ) {}


    async addExpense(expense: Partial<Expense>, userId: string): Promise<Expense> {
        console.log("addExpense - start");
        console.log("expense in addEaxpense: ", expense);
        const newExpense = this.expense_repo.create(expense);
        newExpense.userId = userId;
        newExpense.loadingDate = new Date();
        newExpense.reductionDone = false;
        console.log("this is a newExpense :", newExpense);
        console.log("addExpense - end");
        const resAddExpense = await this.expense_repo.save(newExpense);
        if (!resAddExpense || Object.keys(resAddExpense).length === 0){
            throw new Error ("expense not saved");
        }
        return resAddExpense;
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

        // Explicitly update the vatPercent and taxPercent in the expense_repo and 
        // then call to the calculate function so the sums will update accordingly.
        if (updateExpenseDto.vatPercent !== undefined) expense.vatPercent = updateExpenseDto.vatPercent;
        if (updateExpenseDto.taxPercent !== undefined) expense.taxPercent = updateExpenseDto.taxPercent;
        if (updateExpenseDto.sum !== undefined) expense.sum = updateExpenseDto.sum;
        if (updateExpenseDto.vatPercent !== undefined || updateExpenseDto.taxPercent !== undefined || updateExpenseDto.sum !== undefined) {
            expense.calculateSums();
        }

        return this.expense_repo.save({
            ...expense,
            ...updateExpenseDto,
        });
    
    }

    async deleteExpense(id: number, userId: string): Promise<any> {
        console.log("delete - start");
        console.log("id: ", id);
        
        const expense = await this.expense_repo.findOne({ where: { id } });
    
        if (!expense) {
          throw new NotFoundException(`Expense with ID ${id} not found`);
        }
    
        // Check if the user making the request is the owner of the expense
        if (expense.userId !== userId) {
          throw new UnauthorizedException(`You do not have permission to delete this expense`);
        }
    
        // Delete the expense from the database
        return await this.expense_repo.remove(expense);

    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Categories            /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addDefaultCategory(category: Partial<DefaultCategory>): Promise<DefaultCategory> {
        console.log("addCategory - start");
        const newCategory = this.category_repo.create(category);
        return await this.category_repo.save(newCategory);
    }


    async getAllCategories(isEquipment: boolean): Promise<string[]> {
        const categories = await this.category_repo.find({
            select: ['category'],
            where: { isEquipment: isEquipment}
        });

        const uniqueCategoryNames = [...new Set(categories.map(category => category.category))];
        return uniqueCategoryNames;
    }

    async getSubcategoriesByCategory(categoryName: string, isEquipment: boolean): Promise<DefaultCategory[]> {
        return this.category_repo.find({
          where: { 
                    category: categoryName,
                    isEquipment: isEquipment 
                }
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string, name:string){
        console.log("addSupplier - start");
        const isAlreadyExist = await this.supplier_repo.findOne({where: {name}});
        console.log("is allready: ",isAlreadyExist);
        // if (isAllreadyExist) {
        //     throw new NotFoundException({message:`Supplier with this name: "${name}" is allready exist`, code: 507});

        // }
        if (isAlreadyExist) {
            throw new HttpException({
                status: HttpStatus.CONFLICT,
                error: `Supplier with this name: "${name}" already exists`
            }, HttpStatus.CONFLICT);
        }
        const newSupplier = this.supplier_repo.create(supplier);
        newSupplier.userId = userId;
        return await this.supplier_repo.save(newSupplier);
    }


    async updateSupplier(id: number, userId: string, updateSupplierDto: UpdateSupplierDto): Promise<Supplier> {
        const supplier = await this.supplier_repo.findOne({ where: { id } });
        if (!supplier) {
            throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
        // Check if the user making the request is the owner of the expense
        if (supplier.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this supplier`);
        }
        return this.supplier_repo.save({
            ...supplier,
            ...updateSupplierDto,
        });
    }


    async deleteSupplier(id: number, userId: string): Promise<void> {
        const supplier = await this.supplier_repo.findOne({ where: { id } });
        if (!supplier) {
          throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
        //Check if the user making the request is the owner of the expense
        if (supplier.userId !== userId) {
          throw new UnauthorizedException(`You do not have permission to delete this supplier`);
        }
        await this.supplier_repo.remove(supplier);
    }


async getSupplierNamesByUserId(userId: string): Promise<SupplierResponseDto[]> {
    const suppliers = await this.supplier_repo.find({where: { userId }});
    return suppliers.map((supplier) => {
        const { userId, ...supplierData } = supplier; // Exclude userId
        return supplierData;
    });
}

async getSupplierById(id: number, userId: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplier_repo.findOne({where: { id }});
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    if (supplier.userId !== userId) {
      throw new UnauthorizedException(`You do not have permission to access this supplier`);
    }
    const { userId: omitUserId, ...supplierData } = supplier;
    return supplierData;
}



   

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
