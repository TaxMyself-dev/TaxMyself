//General
import { HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository} from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { User } from '../users/user.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { Category } from './categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';
//import { DefaultCategory } from './categories.entity';
//import { UserCategory } from './user-sub-categories.entity';
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
        @InjectRepository(Category) private categoryRepo: Repository<Category>,
        @InjectRepository(DefaultSubCategory) private defaultSubCategoryRepo: Repository<DefaultSubCategory>,
        @InjectRepository(UserSubCategory) private userSubCategoryRepo: Repository<UserSubCategory>,
        //@InjectRepository(DefaultCategory) private defaultCategoryRepo: Repository<DefaultCategory>,
        //@InjectRepository(UserCategory) private userCategoryRepo: Repository<UserCategory>,
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


    async addUserCategory(
        firebaseId: string,
        createUserCategoryDto: CreateUserCategoryDto
      ): Promise<UserSubCategory> {
        
        // Step 1: Validate that the user exists using the userId
        const user = await this.userRepo.findOne({ where: { firebaseId } });
        if (!user) {
          throw new NotFoundException(`User with ID ${firebaseId} not found`);
        }
    
        // Step 2: Check if the category exists; if not, create it
        let category = await this.categoryRepo.findOne({ where: { category: createUserCategoryDto.categoryName } });
        if (!category) {
          category = new Category();
          category.category = createUserCategoryDto.categoryName;
          category.isDefault = false; // Mark the category as user-defined
          category.firebaseId = firebaseId;
          category = await this.categoryRepo.save(category);
        }

        // Step 3: Check if the sub-category already exists for this user and category
        const existingSubCategory = await this.userSubCategoryRepo.findOne({
            where: {
                subCategory: createUserCategoryDto.subCategoryName,
                category: { id: category.id },   // Compare using the category ID
                user: { index: user.index },     // Compare using the user ID (or index in your case)
            },
        });
    
        if (existingSubCategory) {
          throw new ConflictException(`Sub-category with name ${createUserCategoryDto.subCategoryName} already exists for this user and category`);
        }
    
        // Step 4: Create and save the new user sub-category
        const userSubCategory = new UserSubCategory();
        userSubCategory.subCategory = createUserCategoryDto.subCategoryName;
        userSubCategory.taxPercent = createUserCategoryDto.taxPercent;
        userSubCategory.vatPercent = createUserCategoryDto.vatPercent;
        userSubCategory.reductionPercent = createUserCategoryDto.reductionPercent;
        userSubCategory.isEquipment = createUserCategoryDto.isEquipment;
        userSubCategory.isRecognized = createUserCategoryDto.isRecognized;
        userSubCategory.category = category;
        userSubCategory.user = user;  // Associate with the user found by userId
    
        return await this.userSubCategoryRepo.save(userSubCategory);
      }


      async getCategories(isDefault: boolean | null, firebaseId: string | null): Promise<Category[]> {        

        if (isDefault === null) {
            
            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user-specific categories.');
            }
            const query = this.categoryRepo.createQueryBuilder('category');
            query.where('category.isDefault = :isDefault', { isDefault: true })
                 .orWhere('category.firebaseId = :firebaseId', { firebaseId });
            return query.getMany();
        }
    
        // Case 2: isDefault is true or false
        else if (isDefault === true) {
            // Return only the default categories
            return this.categoryRepo.find({ where: { isDefault: true } });
        }
        
        else if (isDefault === false) {
            // Return only the user-specific categories for the given firebaseId
            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user-specific categories.');
            }
            return this.categoryRepo.find({ where: { isDefault: false, firebaseId } });
        }
    }


      async getSubCategories(firebaseId: string, isEquipment: boolean | null, categoryId: number): Promise<UserSubCategory[]> {
      
        const userSubCategoryQuery = this.userSubCategoryRepo.createQueryBuilder('userSubCategory')
            .innerJoinAndSelect('userSubCategory.category', 'category')
            .innerJoin('userSubCategory.user', 'user') // Join the User entity
            .where('user.firebaseId = :firebaseId', { firebaseId })
            .andWhere('userSubCategory.category.id = :categoryId', { categoryId });
      
        // Apply the isEquipment filter if provided
        if (isEquipment !== null) {
          userSubCategoryQuery.andWhere('userSubCategory.isEquipment = :isEquipment', { isEquipment });
        }
      
        const userSubCategories = await userSubCategoryQuery.getMany();
      
        // Step 3: Build the query for default sub-categories
        const defaultSubCategoryQuery = this.defaultSubCategoryRepo.createQueryBuilder('defaultSubCategory')
            .innerJoinAndSelect('defaultSubCategory.category', 'category')  // Eagerly load the category relation
            .where('defaultSubCategory.category.id = :categoryId', { categoryId });
      
        // Apply the isEquipment filter if provided
        if (isEquipment !== null) {
          defaultSubCategoryQuery.andWhere('defaultSubCategory.isEquipment = :isEquipment', { isEquipment });
        }
      
        const defaultSubCategories = await defaultSubCategoryQuery.getMany();
      
        // Step 4: Combine them, preferring user sub-categories in case of duplicates
        const combinedSubCategories = new Map();
      
        // Add default sub-categories to the map
        defaultSubCategories.forEach(subCategory => {
          const key = `${subCategory.category.category}-${subCategory.subCategory}`;
          combinedSubCategories.set(key, subCategory);
        });
      
        // Add user sub-categories to the map, overriding any default sub-categories
        userSubCategories.forEach(subCategory => {
          const key = `${subCategory.category.category}-${subCategory.subCategory}`;
          combinedSubCategories.set(key, subCategory);
        });
      
        // Step 5: Return the combined sub-categories as an array
        return Array.from(combinedSubCategories.values());
      }


     

      

    // async addUserCategory(
    //     userId: string,
    //     categoryName: string, // Change categoryId to categoryName
    //     subCategoryData: Partial<UserSubCategory>
    //   ): Promise<UserSubCategory> {
    
    //     // Step 1: Validate that the user exists
    //     const user = await this.user_repo.findOne({ where: { userId } });
    //     if (!user) {
    //      throw new NotFoundException(`User with ID ${userId} not found`);
    //     }
    
    //     // Step 2: Check if the category exists; if not, create it
    //     let category = await this.categoryRepo.findOne({ where: { name: categoryName } });
    //     if (!category) {
    //       category = new Category();
    //       category.name = categoryName;
    //       category.isDefault = false; // Mark the category as user-defined
    //       category = await this.categoryRepo.save(category);
    //     }
    
    //     // Step 3: Check if the sub-category already exists for this user and category
    //     const existingSubCategory = await this.userSubCategoryRepo.findOne({
    //       where: {
    //         name: subCategoryData.name,
    //         category: category,
    //         user: user,
    //       },
    //     });
    
    //     if (existingSubCategory) {
    //       throw new ConflictException(`Sub-category with name ${subCategoryData.name} already exists for this user and category`);
    //     }
    
    //     // Step 4: Create and save the new user sub-category
    //     const userSubCategory = new UserSubCategory();
    //     userSubCategory.name = subCategoryData.name;
    //     userSubCategory.taxPercent = subCategoryData.taxPercent;
    //     userSubCategory.vatPercent = subCategoryData.vatPercent;
    //     userSubCategory.reductionPercent = subCategoryData.reductionPercent;
    //     userSubCategory.isEquipment = subCategoryData.isEquipment;
    //     userSubCategory.isRecognized = subCategoryData.isRecognized;
    //     userSubCategory.category = category;
    //     userSubCategory.user = user;
    
    //     return await this.userSubCategoryRepo.save(userSubCategory);
    //   }





    // async addDefaultCategory(category: Partial<DefaultSubCategory>): Promise<DefaultSubCategory> {
    //     console.log("addCategory - start");
    //     const newCategory = this.defaultSubCategoryRepo.create(category);
    //     return await this.defaultSubCategoryRepo.save(newCategory);
    // }



    // async addUserCategory(categoryData: Partial<CreateCategoryDto>, userId: string): Promise<UserSubCategory> {
                                                
    //     const existingUserCategory = await this.userSubCategoryRepo.findOne({ 
    //         where: { userId: userId, category: categoryData.category, subCategory: categoryData.subCategory }
    //     });

    //     if (existingUserCategory) {
    //         throw new ConflictException('Category and sub-category already exist for this user.');
    //     }

    //     const newUserCategory = this.userSubCategoryRepo.create({ ...categoryData, userId });
    //     return this.userSubCategoryRepo.save(newUserCategory);
    // }


    // async getAllCategories(isEquipment: boolean): Promise<string[]> {
    //     const categories = await this.defaultSubCategoryRepo.find({
    //         select: ['category'],
    //         where: { isEquipment: isEquipment}
    //     });

    //     const uniqueCategoryNames = [...new Set(categories.map(category => category.category))];
    //     return uniqueCategoryNames;
    // }

    // async getSubcategoriesByCategory(categoryName: string, isEquipment: boolean): Promise<DefaultSubCategory[]> {
    //     return this.defaultSubCategoryRepo.find({
    //       where: { 
    //                 category: categoryName,
    //                 isEquipment: isEquipment 
    //             }
    //     });
    // }


    // async getDefaultAndUserCategories(userId: string, isEquipment: boolean | null, isRecognized: boolean | null): Promise<any[]> {

    //     console.log("combined categories start!");
    //     console.log("isEquipment is ", isEquipment);
    //     console.log("isRecognized is ", isRecognized);
        

    //     // Create dynamic query object
    //     const categoryQuery: any = {};

    //     if (isEquipment !== null) {
    //         categoryQuery.isEquipment = isEquipment;
    //     }

    //     if (isRecognized !== null) {
    //         categoryQuery.isRecognized = isRecognized;
    //     }

    //     // Fetch user categories with userId
    //     const userCategoryQuery = { ...categoryQuery, userId };
    //     const userCategories = await this.userSubCategoryRepo.find({ where: userCategoryQuery });

    //     // Fetch default categories
    //     const defaultCategories = await this.defaultSubCategoryRepo.find({ where: categoryQuery });
    
    //     const combinedCategories = new Map();
    
    //     // Add default categories to the map
    //     defaultCategories.forEach(category => {
    //       const key = `${category.category}-${category.subCategory}`;
    //       combinedCategories.set(key, category);
    //     });
    
    //     // Add user categories to the map, overriding any default categories
    //     userCategories.forEach(category => {
    //       const key = `${category.category}-${category.subCategory}`;
    //       combinedCategories.set(key, category);
    //     });

    //     console.log("combimedCategories are ", combinedCategories);
    
    //     return Array.from(combinedCategories.values());
    // }


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
          query = query.andWhere('expense.monthReport = :monthReport', { monthReport });
        } else {
          // If isSingleMonth is false, return expenses for the current month and the next month
          const nextMonth = monthReport + 1;
          query = query.andWhere('expense.monthReport IN (:...months)', { months: [monthReport, nextMonth] });
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
