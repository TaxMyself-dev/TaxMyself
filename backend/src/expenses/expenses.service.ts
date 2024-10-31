//General
import { HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository} from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { User } from '../users/user.entity';
import { DefaultCategory } from './default-categories.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserCategory } from './user-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';
import { SharedService } from '../shared/shared.service';
//DTOs
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';

//import { areNumbersEqual } 


@Injectable()
export class ExpensesService {
    
    constructor
    (
        private readonly sharedService: SharedService,
        @InjectRepository(Expense) private expense_repo: Repository<Expense>,
        @InjectRepository(User) private userRepo: Repository<User>,
        @InjectRepository(DefaultCategory) private defaultCategoryRepo: Repository<DefaultCategory>,
        @InjectRepository(DefaultSubCategory) private defaultSubCategoryRepo: Repository<DefaultSubCategory>,
        @InjectRepository(UserCategory) private userCategoryRepo: Repository<UserCategory>,
        @InjectRepository(UserSubCategory) private userSubCategoryRepo: Repository<UserSubCategory>,
        @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>
    ) {}


    async addExpense(expense: Partial<CreateExpenseDto>, userId: string): Promise<Expense> {
        console.log("addExpense - start");
        const newExpense = this.expense_repo.create(expense);
        newExpense.userId = userId;
        //newExpense.dateTimestamp = this.sharedService.convertDateStrToTimestamp(expense.date);
        newExpense.date = expense.date;
        const currentDate = (new Date()).toISOString();
        //newExpense.loadingDate = this.sharedService.convertDateStrToTimestamp(currentDate);
        newExpense.loadingDate = new Date();
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


    async addUserCategory(
        firebaseId: string,
        createUserCategoryDto: CreateUserCategoryDto
      ): Promise<UserSubCategory> {

        console.log("service: add-user-category");
        
        // Step 1: Validate that the user exists using the userId
        const user = await this.userRepo.findOne({ where: { firebaseId } });
        if (!user) {
          throw new NotFoundException(`User with ID ${firebaseId} not found`);
        }
    
        // Step 2: Check if the category exists; if not, create it
        let category = await this.userCategoryRepo.findOne({
            where: {
                categoryName: createUserCategoryDto.categoryName,
                firebaseId: createUserCategoryDto.firebaseId
            }
        });
        if (!category) {
          category = new UserCategory();
          category.categoryName = createUserCategoryDto.categoryName;
          category.firebaseId = firebaseId;
          category = await this.userCategoryRepo.save(category);
        }

        console.log("new category is ", category.categoryName);

        // Step 3: Check if the sub-category already exists for this user and category
        const existingSubCategory = await this.userSubCategoryRepo.findOne({
            where: {
                subCategoryName: createUserCategoryDto.subCategoryName,
                //category: { id: category.id },   // Compare using the category ID
                user: { index: user.index },     // Compare using the user ID (or index in your case)
            },
        });
    
        if (existingSubCategory) {
          throw new ConflictException(`Sub-category with name ${createUserCategoryDto.subCategoryName} already exists for this user and category`);
        }

        console.log("existingSubCategory is ", existingSubCategory);
    
        // Step 4: Create and save the new user sub-category
        const userSubCategory = new UserSubCategory();
        console.log("new sub category is ", userSubCategory.subCategoryName);

        userSubCategory.subCategoryName = createUserCategoryDto.subCategoryName;
        userSubCategory.taxPercent = createUserCategoryDto.taxPercent;
        userSubCategory.vatPercent = createUserCategoryDto.vatPercent;
        userSubCategory.reductionPercent = createUserCategoryDto.reductionPercent;
        userSubCategory.isEquipment = createUserCategoryDto.isEquipment;
        userSubCategory.isRecognized = createUserCategoryDto.isRecognized;
        //userSubCategory.firebaseId = createUserCategoryDto.
        userSubCategory.category = category;
        userSubCategory.user = user;  // Associate with the user found by userId
    
        console.log("new sub category is ", userSubCategory.subCategoryName);

        return await this.userSubCategoryRepo.save(userSubCategory);
    }


    async getCategories(isDefault: boolean | null, firebaseId: string | null): Promise<(UserCategory | DefaultCategory)[]> {

        if (isDefault === null) {

            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user-specific categories.');
            }
    
            const defaultCategories = await this.defaultCategoryRepo.find();
            const userCategories = await this.userCategoryRepo.find({ where: { firebaseId } });
    
            const categoryMap = new Map<string, UserCategory | DefaultCategory>();
    
            // First, add all default categories
            defaultCategories.forEach(category => {
                categoryMap.set(category.categoryName, category);
            });
    
            // Then, add/override with user-specific categories (preference for user categories)
            userCategories.forEach(category => {
                categoryMap.set(category.categoryName, category);
            });
    
            // Convert the map back to an array
            return Array.from(categoryMap.values());
        } 
        
        else if (isDefault === true) {
            // Return only the default categories
            return await this.defaultCategoryRepo.find();
        } 
        
        else if (isDefault === false) {
            // Return only the user-specific categories for the given firebaseId
            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user-specific categories.');
            }
            return await this.userCategoryRepo.find({ where: { firebaseId } });
        }
    }
    

    async getSubCategories(firebaseId: string | null, isEquipment: boolean | null, categoryName: string): Promise<(UserSubCategory | DefaultSubCategory)[]> {
        if (!firebaseId) {
            throw new Error('firebaseId must be provided for user-specific subcategory search.');
        }
    
        // Search in userSubCategoryRepo for all matching subcategories by joining the category and filtering by categoryName
        const userSubCategories = await this.userSubCategoryRepo
            .createQueryBuilder('subcategory')
            .leftJoinAndSelect('subcategory.category', 'category')
            .where('subcategory.firebaseId = :firebaseId', { firebaseId })
            .andWhere('subcategory.isEquipment = :isEquipment', { isEquipment })
            .andWhere('category.categoryName = :categoryName', { categoryName })
            .getMany();
    
        // If user-specific subcategories are found, return them
        if (userSubCategories.length > 0) {
            return userSubCategories;
        }
    
        // If no results in userSubCategoryRepo, search in defaultSubCategoryRepo by joining the category and filtering by categoryName
        const defaultSubCategories = await this.defaultSubCategoryRepo
            .createQueryBuilder('subcategory')
            .leftJoinAndSelect('subcategory.category', 'category')
            .where('subcategory.isEquipment = :isEquipment', { isEquipment })
            .andWhere('category.categoryName = :categoryName', { categoryName })
            .getMany();
    
        if (defaultSubCategories.length > 0) {
            return defaultSubCategories;
        }
    
        // If no results in either repository, throw an error
        throw new Error('No subcategories found in either user or default repository.');
    }
    


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string){
        console.log("addSupplier - start");
        
        const isAlreadyExist = await this.supplier_repo.findOne({where: {supplier:supplier.supplier}});
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


    async getExpensesForVatReport(userId: string, isSingleMonth: boolean, monthReport: number): Promise<Expense[]> {

        // Valid months when isSingleMonth is false
        const validMonths = [1, 3, 5, 7, 9, 11];        
      
        // Check if monthReport is valid when isSingleMonth is false
        if (!isSingleMonth && !validMonths.includes(monthReport)) {
          throw new Error('Invalid monthReport. When isSingleMonth is false, monthReport must be one of [1, 3, 5, 7, 9, 11].');
        }        
      
        // Build the query to fetch expenses for the user
        let query = this.expense_repo.createQueryBuilder('expense')
          .where('expense.userId = :userId', { userId });
      
        if (isSingleMonth) {            
          // If isSingleMonth is true, return only expenses for the specified month
          query = query.andWhere('expense.vatReportingDate = :monthReport', { monthReport });
        } else {
          // If isSingleMonth is false, return expenses for the current month and the next month
          const nextMonth = monthReport + 1;
          query = query.andWhere('expense.vatReportingDate IN (:...months)', { months: [monthReport, nextMonth] });
        }
      
        // Execute the query and return the results
        const results = await query.getMany();
        return results;

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
