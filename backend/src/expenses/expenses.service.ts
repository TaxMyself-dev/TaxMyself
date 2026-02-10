//General
import { HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
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
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
import { CreateUserSubCategoryDto } from './dtos/create-user-sub-category.dto';


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
        ) { }


    async addExpense(expense: CreateExpenseDto, userId: string, businessNumber: string): Promise<Expense> {
        console.log("addExpense - start");
        const newExpense = this.expense_repo.create(expense);
        // isEquipment should be true only if category is "רכוש קבוע", otherwise always false
        if (expense.category === 'רכוש קבוע') {
            const isEquipment = await this.getSubCategoryIsEquipment(expense.category, expense.subCategory, userId, businessNumber);
            newExpense.isEquipment = isEquipment ?? false;
        } else {
            newExpense.isEquipment = false;
        }
        newExpense.userId = userId;
        newExpense.date = expense.date;
        const currentDate = (new Date()).toISOString();
        newExpense.loadingDate = new Date();
        newExpense.businessNumber = businessNumber;
        
        // Calculate totalVatPayable and totalTaxPayable
        // Get VAT rate for the expense date year
        const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
        
        // Calculate totalVatPayable: (sum / (1 + vatRate)) * vatRate * (vatPercent / 100)
        // This calculates the VAT amount that can be claimed based on the vatPercent
        newExpense.totalVatPayable = (newExpense.sum / (1 + vatRate)) * vatRate * (newExpense.vatPercent / 100);
        
        // Calculate totalTaxPayable: (sum - totalVatPayable) * (taxPercent / 100)
        // This calculates the tax amount based on the amount after VAT
        newExpense.totalTaxPayable = (newExpense.sum - newExpense.totalVatPayable) * (newExpense.taxPercent / 100);
        
        const resAddExpense = await this.expense_repo.save(newExpense);
        if (!resAddExpense || Object.keys(resAddExpense).length === 0) {
            throw new Error("expense not saved");
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
        if (updateExpenseDto.category !== undefined) expense.category = updateExpenseDto.category;
        if (updateExpenseDto.subCategory !== undefined) expense.subCategory = updateExpenseDto.subCategory;
        
        // Update isEquipment based on category: true only if category is "רכוש קבוע", otherwise always false
        if (updateExpenseDto.category !== undefined || updateExpenseDto.subCategory !== undefined) {
            const categoryToCheck = updateExpenseDto.category ?? expense.category;
            if (categoryToCheck === 'רכוש קבוע') {
                const subCategoryToCheck = updateExpenseDto.subCategory ?? expense.subCategory;
                const isEquipment = await this.getSubCategoryIsEquipment(categoryToCheck, subCategoryToCheck, userId, expense.businessNumber);
                expense.isEquipment = isEquipment ?? false;
            } else {
                expense.isEquipment = false;
            }
        }
        
        // Recalculate totalVatPayable and totalTaxPayable if sum, vatPercent, or taxPercent changed
        if (updateExpenseDto.vatPercent !== undefined || updateExpenseDto.taxPercent !== undefined || updateExpenseDto.sum !== undefined) {
            // Get VAT rate for the expense date year
            const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
            
            // Calculate totalVatPayable: (sum / (1 + vatRate)) * vatRate * (vatPercent / 100)
            expense.totalVatPayable = (expense.sum / (1 + vatRate)) * vatRate * (expense.vatPercent / 100);
            
            // Calculate totalTaxPayable: (sum - totalVatPayable) * (taxPercent / 100)
            expense.totalTaxPayable = (expense.sum - expense.totalVatPayable) * (expense.taxPercent / 100);
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

    async saveFileToExpenses(expensesData: { id: number, file: string | null }[], userId: string, fromTransactions: boolean = false): Promise<{ message: string }> {

        const user = await this.userRepo.findOne({ where: { firebaseId: userId } });

        // Extract IDs from the expensesData array
        const expensesIds = expensesData.map(ed => ed.id);

        // Fetch expenses with the given IDs
        // const expenses = await this.expense_repo.findBy({ id: In(expensesIds) });
        const expenses = await this.expense_repo.findBy({
            [fromTransactions ? 'transId' : 'id']: In(expensesIds),
        });
        if (!expenses || expenses.length === 0) {
            throw new Error('No expenses found with the provided IDs.');
        }


        for (const expense of expenses) {

            if (expense.userId !== userId) {
                throw new Error(`Error: expense with ID ${expense.id} does not belong to the user.`);
            }

            // Find the corresponding file from the input data
            const expenseFile = expensesData.find(ed => ed.id === (fromTransactions ? expense.transId : expense.id))?.file || '';
            expense.file = expenseFile;
            await this.expense_repo.save(expense);

        }
        const message = 'success add'

        return { message };

    }

    async deleteFileFromExpense(expenseId: number, userId: string): Promise<{ message: string, file: string | null }> {
        // Find the expense by ID
        const expense = await this.expense_repo.findOne({ where: { id: expenseId } });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${expenseId} not found.`);
        }

        // Verify the expense belongs to the user
        if (expense.userId !== userId) {
            throw new ForbiddenException(`You don't have permission to delete this file.`);
        }

        // Store the file path before deletion (in case needed for cleanup)
        const deletedFilePath = expense.file;

        // Remove the file reference from the expense
        expense.file = null;
        await this.expense_repo.save(expense);

        return {
            message: 'File deleted successfully',
            file: deletedFilePath
        };
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Categories            /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    private async getUserCategory(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
    ): Promise<UserCategory | null> {
        return this.userCategoryRepo.findOne({
            where: {
                categoryName,
                firebaseId,
                businessNumber,
            },
        });
    }

    private async saveUserSubCategories(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
        subCategories: CreateUserSubCategoryDto[],
    ): Promise<UserSubCategory[]> {
        if (!subCategories.length) {
            return [];
        }

        const names = subCategories.map(s => s.subCategoryName);

        const existingSubs = await this.userSubCategoryRepo.find({
            where: names.map((subCategoryName) => ({
                firebaseId,
                categoryName,
                subCategoryName,
            })),
            select: { subCategoryName: true },
        });

        if (existingSubs.length) {
            throw new ConflictException({
                message: `Some sub-categories already exist`,
                duplicates: existingSubs.map(s => s.subCategoryName),
            });
        }

        const entities = subCategories.map((subDto) =>
            this.userSubCategoryRepo.create({
                subCategoryName: subDto.subCategoryName,
                taxPercent: subDto.taxPercent ?? 0,
                vatPercent: subDto.vatPercent ?? 0,
                reductionPercent: subDto.reductionPercent ?? 0,
                isEquipment: subDto.isEquipment ?? false,
                isRecognized: subDto.isRecognized ?? false,
                firebaseId,
                businessNumber,
                categoryName,
                isExpense: subDto.isExpense,
            })
        );

        return this.userSubCategoryRepo.save(entities);
    }

    async addUserCategory(
        firebaseId: string,
        createUserCategoryDto: CreateUserCategoryDto,
        businessNumber: string
    ): Promise<UserSubCategory[]> {

        // Step 1: Validate that the user exists
        const user = await this.userRepo.findOne({ where: { firebaseId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${firebaseId} not found`);
        }

        const existingCategory = await this.getUserCategory(firebaseId, businessNumber, createUserCategoryDto.categoryName);

        if (existingCategory) {
            throw new ConflictException(`Category with name ${createUserCategoryDto.categoryName} already exists`);
        }

        await this.userCategoryRepo.save(this.userCategoryRepo.create({
            categoryName: createUserCategoryDto.categoryName,
            firebaseId,
            businessNumber,
            isExpense: createUserCategoryDto.isExpense ?? true,
        }));

        return this.saveUserSubCategories(
            firebaseId,
            businessNumber,
            createUserCategoryDto.categoryName,
            createUserCategoryDto.subCategories,
        );
    }


    async addUserSubCategories(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
        subCategories: CreateUserSubCategoryDto[],
        defaultIsExpense?: boolean
    ): Promise<UserSubCategory[]> {
        const user = await this.userRepo.findOne({ where: { firebaseId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${firebaseId} not found`);
        }

        const category = await this.getUserCategory(firebaseId, businessNumber, categoryName);
        if (!category) {
            throw new NotFoundException(`Category with name ${categoryName} not found`);
        }

        return this.saveUserSubCategories(
            firebaseId,
            businessNumber,
            categoryName,
            subCategories,
        );
    }


    async getCategories(isDefault: boolean | null, isExpense: boolean, firebaseId: string | null, businessNumber: string | null): Promise<(UserCategory | DefaultCategory)[]> {

        if (isDefault === null) {

            if (!firebaseId || !businessNumber) {
                throw new Error('firebaseId and businessNumber must be provided to fetch user-specific categories.');
            }

            const defaultCategories = await this.defaultCategoryRepo.find();
            const userCategories = await this.userCategoryRepo.find({ where: { firebaseId, businessNumber } });
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
            let categories = Array.from(categoryMap.values());

            if (isExpense === null) {
                return categories;
            }
            // Filter by isExpense if the flag is provided
            categories = categories.filter(category => category.isExpense === isExpense);

            return categories;
        }

        else if (isDefault === true) {
            // Return only the default categories
            let defaultCategories = await this.defaultCategoryRepo.find();
            // Filter by isExpense if the flag is provided
            defaultCategories = defaultCategories.filter(category => category.isExpense === isExpense);
            return defaultCategories;
        }

        else if (isDefault === false) {
            // Return only the user-specific categories for the given firebaseId
            if (!firebaseId || !businessNumber) {
                throw new Error('firebaseId and businessNumber must be provided to fetch user-specific categories.');
            }
            let userCategories = await this.userCategoryRepo.find({ where: { firebaseId, businessNumber } });
            // Filter by isExpense if the flag is provided
            userCategories = userCategories.filter(category => category.isExpense === isExpense);
            return userCategories;
        }

    }


    async getSubCategories(
        firebaseId: string | null,
        isEquipment: boolean | null,
        isExpense: boolean,
        categoryName: string,
        businessNumber: string | null
    ): Promise<(UserSubCategory | DefaultSubCategory)[]> {

        if (!firebaseId || !businessNumber) {
            throw new Error('firebaseId and businessNumber must be provided for user-specific subcategory search.');
        }

        // Query userSubCategoryRepo by categoryName
        const userQuery = this.userSubCategoryRepo
            .createQueryBuilder('subcategory')
            .where('subcategory.firebaseId = :firebaseId', { firebaseId })
            .andWhere('subcategory.businessNumber = :businessNumber', { businessNumber })
            .andWhere('subcategory.categoryName = :categoryName', { categoryName });

        // Add the isEquipment condition only if it’s true or false (not null)
        if (isEquipment !== null) {
            userQuery.andWhere('subcategory.isEquipment = :isEquipment', { isEquipment });
        }

        const userSubCategories = await userQuery.getMany();

        // Query defaultSubCategoryRepo by categoryName
        const defaultQuery = this.defaultSubCategoryRepo
            .createQueryBuilder('subcategory')
            .where('subcategory.categoryName = :categoryName', { categoryName });

        // Add the isEquipment condition only if it’s true or false (not null)
        if (isEquipment !== null) {
            defaultQuery.andWhere('subcategory.isEquipment = :isEquipment', { isEquipment });
        }

        const defaultSubCategories = await defaultQuery.getMany();

        // Combine results, giving precedence to userSubCategories if subCategoryName matches
        const combinedSubCategoriesMap = new Map<string, UserSubCategory | DefaultSubCategory>();

        // Add all userSubCategories to the map
        userSubCategories.forEach(subCategory => {
            combinedSubCategoriesMap.set(subCategory.subCategoryName, subCategory);
        });

        // Add defaultSubCategories, only if they are not already in the map
        defaultSubCategories.forEach(subCategory => {
            if (!combinedSubCategoriesMap.has(subCategory.subCategoryName)) {
                combinedSubCategoriesMap.set(subCategory.subCategoryName, subCategory);
            }
        });

        // Get the combined subcategories as an array
        let subCategories = Array.from(combinedSubCategoriesMap.values());
        // Filter by isExpense if the flag is provided
        subCategories = subCategories.filter(subCategory => subCategory.isExpense === isExpense);
        return subCategories;
    }


    async getSubCategoryIsEquipment(
        categoryName: string,
        subCategoryName: string,
        firebaseId?: string | null,
        businessNumber?: string | null,
    ): Promise<boolean | null> {
        categoryName = categoryName?.trim();
        subCategoryName = subCategoryName?.trim();
        if (!categoryName || !subCategoryName) {
            return null;
        }

        if (firebaseId && businessNumber) {
            const userMatch = await this.userSubCategoryRepo.findOne({
                where: {
                    categoryName,
                    subCategoryName,
                    firebaseId,
                    businessNumber,
                },
                select: { isEquipment: true },
            });

            if (userMatch) {
                return userMatch.isEquipment ?? null;
            }
        }

        const defaultMatch = await this.defaultSubCategoryRepo.findOne({
            where: {
                categoryName,
                subCategoryName,
            },
            select: { isEquipment: true },
        });
        console.log("🚀 ~ ExpensesService ~ getSubCategoryIsEquipment ~ defaultMatch:", defaultMatch)

        return defaultMatch?.isEquipment ?? null;
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string) {
        console.log("addSupplier - start");

        const isAlreadyExist = await this.supplier_repo.findOne({ where: { supplier: supplier.supplier } });
        console.log("is allready: ", isAlreadyExist);
        if (isAlreadyExist) {
            throw new HttpException({
                status: HttpStatus.CONFLICT,
                error: `Supplier with this name: "${supplier}" already exists`
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


    async getSupplierNamesByUserId(userId: string, businessNumber?: string): Promise<SupplierResponseDto[]> {
        const suppliers = await this.supplier_repo.find({ where: { userId, businessNumber } });
        return suppliers.map((supplier) => {
            const { userId, businessNumber, ...supplierData } = supplier; // Exclude userId
            return supplierData;
        });
    }

    async getSupplierById(id: number, userId: string): Promise<SupplierResponseDto> {
        const supplier = await this.supplier_repo.findOne({ where: { id } });
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

    async getExpensesByUserID(
        userId: string,
        startDate?: Date,
        endDate?: Date,
        businessNumber?: string,
        page: number = 1 // default to the first page
    ): Promise<Expense[]> {
        // Build the query object
        const where: any = { userId };

        // Add date filtering if provided
        if (startDate) {
            where.date = { ...where.date, $gte: startDate };
        }
        if (endDate) {
            where.date = { ...where.date, $lte: endDate };
        }
        // Add business number filtering if provided
        if (businessNumber) {
            where.businessNumber = businessNumber;
        }

        // Query the database
        const expenses = await this.expense_repo.find({

            where: {
                userId: userId,
                ...(startDate && endDate ? { date: Between(startDate, endDate) } : {}),
                ...(businessNumber ? { businessNumber: businessNumber } : {})
            },
            order: { date: 'DESC' }, // Sort by the most recent date
            take: 50, // Limit the results to 50
            skip: (page - 1) * 50, // Offset for pagination
        }

        );

        return expenses;
    }


    async getExpensesForVatReport(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<Expense[]> {

        // IMPORTANT: await the promise!
        const reportedExpenses = await this.getExpensesByDates(userId, businessNumber, startDate, endDate);

        // // Valid months when isSingleMonth is false
        // const validMonths = [1, 3, 5, 7, 9, 11];        

        // // Check if monthReport is valid when isSingleMonth is false
        // if (!isSingleMonth && !validMonths.includes(monthReport)) {
        //   throw new Error('Invalid monthReport. When isSingleMonth is false, monthReport must be one of [1, 3, 5, 7, 9, 11].');
        // }        

        // // Build the query to fetch expenses for the user
        // let query = this.expense_repo.createQueryBuilder('expense')
        //   .where('expense.userId = :userId', { userId });

        // if (isSingleMonth) {            
        //   // If isSingleMonth is true, return only expenses for the specified month
        //   query = query.andWhere('expense.vatReportingDate = :monthReport', { monthReport });
        // } else {
        //   // If isSingleMonth is false, return expenses for the current month and the next month
        //   const nextMonth = monthReport + 1;
        //   query = query.andWhere('expense.vatReportingDate IN (:...months)', { months: [monthReport, nextMonth] });
        // }

        // Execute the query and return the results
        //const results = await query.getMany();
        return reportedExpenses;

    }


    async getExpensesByDates(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<Expense[]> {
        return this.expense_repo.find({
            where: {
                userId: userId,
                businessNumber: businessNumber,
                date: Between(startDate, endDate)
            }
        });
    }


    async getExpensesForReductionReport(userId: string, businessNumber: string, year: number): Promise<Expense[]> {

        console.log("businessNumber is ", businessNumber);
        console.log("year is ", year);
        console.log("userId is ", userId);

        return this.expense_repo.find({
            where: {
                userId: userId,
                businessNumber: businessNumber,
                isEquipment: true,
                reductionDone: MoreThanOrEqual(year),
                //date: MoreThanOrEqual(new Date(`${year}-01-01`))
            }
        });
    }


    findOne(id: number) {
        if (!id) {
            return null;
        }
        return this.expense_repo.findOneBy({ id });
    }

    find(id: number) {
        return this.expense_repo.find({ where: { id } })
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
