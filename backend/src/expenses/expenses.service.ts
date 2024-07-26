//General
import { HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository} from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { DefaultCategory } from './categories.entity';
import { UserCategory } from './user-categories.entity';
import { SharedService } from 'src/shared/shared.service';
//DTOs
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { CreateCategoryDto } from './dtos/create-category.dto';

//import { areNumbersEqual } 


@Injectable()
export class ExpensesService {
    
    constructor
    (
        private readonly sharedService: SharedService,
        @InjectRepository(Expense) private expense_repo: Repository<Expense>,
        @InjectRepository(DefaultCategory) private defaultCategoryRepo: Repository<DefaultCategory>,
        @InjectRepository(UserCategory) private userCategoryRepo: Repository<UserCategory>,
        @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>
    ) {}


    async addExpense(expense: Partial<CreateExpenseDto>, userId: string): Promise<Expense> {
        console.log("addExpense - start");
        const newExpense = this.expense_repo.create(expense);
        newExpense.userId = userId;
        newExpense.dateTimestamp = this.sharedService.convertDateStrToTimestamp(expense.date);
        const currentDate = (new Date()).toISOString();
        newExpense.loadingDate = this.sharedService.convertDateStrToTimestamp(currentDate);
        newExpense.reductionDone = false;
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
        const newCategory = this.defaultCategoryRepo.create(category);
        return await this.defaultCategoryRepo.save(newCategory);
    }



    async addUserCategory(categoryData: Partial<CreateCategoryDto>, userId: string): Promise<UserCategory> {
                                                
        const existingUserCategory = await this.userCategoryRepo.findOne({ 
            where: { userId: userId, category: categoryData.category, subCategory: categoryData.subCategory }
        });

        // const existingDefaultCategory = await this.defaultCategoryRepo.findOne({ 
        //     where: { category: categoryData.category, subCategory: categoryData.subCategory }
        // });

        if (existingUserCategory) {
            throw new ConflictException('Category and sub-category already exist for this user.');
        }

        const newUserCategory = this.userCategoryRepo.create({ ...categoryData, userId });
        return this.userCategoryRepo.save(newUserCategory);
    }


    async getAllCategories(isEquipment: boolean): Promise<string[]> {
        const categories = await this.defaultCategoryRepo.find({
            select: ['category'],
            where: { isEquipment: isEquipment}
        });

        const uniqueCategoryNames = [...new Set(categories.map(category => category.category))];
        return uniqueCategoryNames;
    }

    async getSubcategoriesByCategory(categoryName: string, isEquipment: boolean): Promise<DefaultCategory[]> {
        return this.defaultCategoryRepo.find({
          where: { 
                    category: categoryName,
                    isEquipment: isEquipment 
                }
        });
    }


    async getDefaultAndUserCategories(userId: string): Promise<any[]> {

        console.log("combined categories start!");
                

        const userCategories = await this.userCategoryRepo.find({ where: { userId } });
        const defaultCategories = await this.defaultCategoryRepo.find();
    
        const combinedCategories = new Map();
    
        // Add default categories to the map
        defaultCategories.forEach(category => {
          const key = `${category.category}-${category.subCategory}`;
          combinedCategories.set(key, category);
        });
    
        // Add user categories to the map, overriding any default categories
        userCategories.forEach(category => {
          const key = `${category.category}-${category.subCategory}`;
          combinedCategories.set(key, category);
        });

        console.log("combimedCategories are ", combinedCategories);
    
        return Array.from(combinedCategories.values());
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string, name:string){
        console.log("addSupplier - start");
        const isAlreadyExist = await this.supplier_repo.findOne({where: {name}});
        console.log("is allready: ",isAlreadyExist);
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
