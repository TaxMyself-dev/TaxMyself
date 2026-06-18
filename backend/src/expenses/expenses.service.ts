//General
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { User } from '../users/user.entity';
import { DefaultCategory } from './default-categories.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserCategory } from './user-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument, ExtractedDocStatus } from '../documents/extracted-document.entity';
import { SharedService } from '../shared/shared.service';
import { FxRateService } from '../shared/fx-rate.service';
import { Business } from 'src/business/business.entity';
import { BusinessType, VATReportingType, ExpenseReportScope } from 'src/enum';
//DTOs
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/response-supplier.dto';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { CreateUserCategoryDto } from './dtos/create-user-category.dto';
import { CreateUserSubCategoryDto } from './dtos/create-user-sub-category.dto';
import { UpdateUserCategoryDto } from './dtos/update-user-category.dto';
import { UpdateUserSubCategoryDto } from './dtos/update-user-sub-category.dto';


@Injectable()
export class ExpensesService {
    private readonly logger = new Logger(ExpensesService.name);

    constructor
        (
            private readonly sharedService: SharedService,
            @InjectRepository(Expense) private expense_repo: Repository<Expense>,
            @InjectRepository(User) private userRepo: Repository<User>,
            @InjectRepository(DefaultCategory) private defaultCategoryRepo: Repository<DefaultCategory>,
            @InjectRepository(DefaultSubCategory) private defaultSubCategoryRepo: Repository<DefaultSubCategory>,
            @InjectRepository(UserCategory) private userCategoryRepo: Repository<UserCategory>,
            @InjectRepository(UserSubCategory) private userSubCategoryRepo: Repository<UserSubCategory>,
            @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>,
            @InjectRepository(Business) private businessRepo: Repository<Business>,
            @InjectRepository(ClassifiedTransactions) private rulesRepo: Repository<ClassifiedTransactions>,
            @InjectRepository(ExtractedDocument) private extractedDocRepo: Repository<ExtractedDocument>,
            private readonly fxRateService: FxRateService,
            private readonly dataSource: DataSource,
        ) { }


    async addExpense(
        expense: CreateExpenseDto,
        userId: string,
        businessNumber: string,
        /** Opt-out flag for the Supplier-table auto-create below. Default
         *  true (preserves current behavior for every caller that doesn't
         *  pass it). The report-review modal sets this to `false` when the
         *  user clicked the red flag icon on a row to dismiss adding that
         *  one-off vendor to their master list. */
        saveAsSupplier: boolean = true,
    ): Promise<Expense> {
        console.log("addExpense - start");
        const newExpense = this.expense_repo.create(expense);

        // Foreign-currency manual entry: when the form sends originalCurrency
        // + originalSum, ignore any client-supplied `sum` and let the BOI rate
        // (on `expense.date`) be the source of truth for the stored ILS value.
        // Also persist `originalCurrency` + `originalSum` so the expenses
        // table can render "$X (₪Y)" without losing the original amount.
        // FxRateService throws ServiceUnavailable on persistent failure — the
        // exception propagates to the controller as 503 with a Hebrew message.
        const oc = expense.originalCurrency?.toUpperCase();
        if (oc && oc !== 'ILS' && expense.originalSum != null) {
            const rate = await this.fxRateService.getRate(new Date(expense.date), oc);
            if (rate == null) {
                throw new Error(`Unsupported currency for FX conversion: ${oc}`);
            }
            newExpense.sum = Number((Math.abs(Number(expense.originalSum)) * rate).toFixed(2));
            newExpense.originalCurrency = oc;
            newExpense.originalSum = Math.abs(Number(expense.originalSum));
        } else {
            // Plain ILS entry — clear in case the form spread leaked stale values.
            newExpense.originalCurrency = null;
            newExpense.originalSum = null;
        }

        // isEquipment resolution:
        //   1) Trust an explicit value from the DTO (the OCR bulk-confirm flow
        //      sends it from the catalog match — sub-categories tagged
        //      isEquipment=true should win regardless of parent category name).
        //   2) Otherwise fall back to the legacy behavior: only the parent
        //      category "רכוש קבוע" triggers an isEquipment lookup; everything
        //      else stays false (preserves the existing manual-entry contract).
        if (typeof (expense as any).isEquipment === 'boolean') {
            newExpense.isEquipment = (expense as any).isEquipment;
        } else if (expense.category === 'רכוש קבוע') {
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

        // Manual entry bypasses slim/cache — snapshot the report scope straight
        // from the chosen subcategory (user override wins, default PNL).
        // pnlCategory stays NULL (resolved live; overridable via Edit dialog).
        newExpense.reportScope = await this.getSubCategoryReportScope(
            expense.category, expense.subCategory, userId, businessNumber,
        );

        // Calculate totalVatPayable and totalTaxPayable
        // Get VAT rate for the expense date year
        const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));

        // Calculate totalVatPayable: (sum / (1 + vatRate)) * vatRate * (vatPercent / 100)
        // This calculates the VAT amount that can be claimed based on the vatPercent
        newExpense.totalVatPayable = (newExpense.sum / (1 + vatRate)) * vatRate * (newExpense.vatPercent / 100);

        // Calculate totalTaxPayable: (sum - totalVatPayable) * (taxPercent / 100)
        // This calculates the tax amount based on the amount after VAT
        newExpense.totalTaxPayable = (newExpense.sum - newExpense.totalVatPayable) * (newExpense.taxPercent / 100);

        // Duplicate guard — hard block any new Expense that exactly matches
        // an existing row on (userId, businessNumber, supplier, sum, date).
        // Run AFTER the FX conversion so the `sum` comparison is ILS-on-
        // both-sides (the foreign-currency manual entry block above may have
        // rewritten newExpense.sum from the foreign-currency originalSum).
        // Same strictness as checkDuplicateExpensesFromDrive — keep it tight
        // so legitimate same-day repeat purchases (two ₪50 fuel receipts)
        // still go through; only exact (supplier, sum, date) matches block.
        const trimmedSupplier = newExpense.supplier?.trim();
        if (trimmedSupplier) {
            const existing = await this.expense_repo.findOne({
                where: {
                    userId,
                    businessNumber,
                    supplier: trimmedSupplier,
                    sum: newExpense.sum,
                    date: newExpense.date as any,
                },
            });
            if (existing) {
                throw new ConflictException({
                    message: `כבר קיימת הוצאה זהה במערכת (ספק: ${trimmedSupplier}, סכום: ${newExpense.sum}, תאריך: ${newExpense.date}). ההוצאה לא נשמרה.`,
                    existingExpenseId: existing.id,
                    existingPeriod: existing.vatReportingDate ?? null,
                });
            }
        }

        const resAddExpense = await this.expense_repo.save(newExpense);
        if (!resAddExpense || Object.keys(resAddExpense).length === 0) {
            throw new Error("expense not saved");
        }

        // Auto-register the supplier in the user's master list. Runs AFTER
        // the Expense save so a Supplier row never lands without its
        // triggering Expense. Idempotent via the supplierID find-or-create
        // — a user with 100 monthly Bezeq invoices ends up with one
        // `supplier` row, not 100. supplierID is the unique key (within a
        // user); empty IDs (foreign vendors like Anthropic that have no
        // Israeli tax ID) get skipped here since there's nothing reliable
        // to deduplicate against. saveAsSupplier=false skips the whole
        // block — the review modal sets this when the user dismissed the
        // red flag on the row. Best-effort: a failed Supplier save logs
        // and continues — the Expense is already committed and the user
        // shouldn't lose their action because of master-list bookkeeping.
        const supplierIdTrimmed = newExpense.supplierID?.trim();
        if (saveAsSupplier && supplierIdTrimmed) {
            try {
                const existing = await this.supplier_repo.findOne({
                    where: { userId, supplierID: supplierIdTrimmed },
                });
                if (!existing) {
                    await this.supplier_repo.save(this.supplier_repo.create({
                        userId,
                        businessNumber,
                        supplier: newExpense.supplier ?? '',
                        supplierID: supplierIdTrimmed,
                        category: newExpense.category ?? '',
                        subCategory: newExpense.subCategory ?? '',
                        vatPercent: newExpense.vatPercent ?? 0,
                        taxPercent: newExpense.taxPercent ?? 0,
                        isEquipment: !!newExpense.isEquipment,
                        reductionPercent: 0,
                    }));
                }
            } catch (err: any) {
                this.logger.warn(
                    `addExpense: auto-create Supplier failed (supplierID=${supplierIdTrimmed}, expense=${resAddExpense.id}): ${err?.message ?? err}`,
                );
            }
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
            const dupNames = existingSubs.map((s) => s.subCategoryName);
            throw new ConflictException({
                message:
                    dupNames.length === 1
                        ? 'תת קטגוריה זו כבר קיימת אצלך (באותה קטגוריית אב)'
                        : 'חלק מתתי הקטגוריות כבר קיימות אצלך (באותה קטגוריית אב)',
                duplicates: dupNames,
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
                reportScope: subDto.reportScope ?? ExpenseReportScope.PNL,
                pnlCategory: subDto.pnlCategory ?? null,
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

        // אין דרישה שקטגוריית-אב תופיע ב-user_category (יכולה להיות רק ברירת מחדל).
        // כפילות תת־קטגוריה לאותו משתמש/עסק/קטגוריה נבדקת ב-saveUserSubCategories.

        return this.saveUserSubCategories(
            firebaseId,
            businessNumber,
            categoryName,
            subCategories,
        );
    }


    // async getCategories(isDefault: boolean | null, isExpense: boolean, firebaseId: string | null, businessNumber: string | null): Promise<(UserCategory | DefaultCategory)[]> {

    //     if (isDefault === null) {

    //         if (!firebaseId || !businessNumber) {
    //             throw new Error('firebaseId and businessNumber must be provided to fetch user-specific categories.');
    //         }

    //         const defaultCategories = await this.defaultCategoryRepo.find();
    //         const userCategories = await this.userCategoryRepo.find({ where: { firebaseId, businessNumber } });
    //         console.log("🚀 ~ ExpensesService ~ getCategories ~ userCategories:", userCategories)
    //         const categoryMap = new Map<string, UserCategory | DefaultCategory>();

    //         // First, add all default categories
    //         defaultCategories.forEach(category => {
    //             categoryMap.set(category.categoryName, category);
    //         });
    //         // Then, add/override with user-specific categories (preference for user categories)
    //         userCategories.forEach(category => {
    //             categoryMap.set(category.categoryName, category);
    //         });
    //         // Convert the map back to an array
    //         let categories = Array.from(categoryMap.values());

    //         if (isExpense === null) {
    //             return categories;
    //         }
    //         // Filter by isExpense if the flag is provided
    //         categories = categories.filter(category => category.isExpense === isExpense);
    //         // console.log("🚀 ~ ExpensesService ~ getCategories ~ categories:", categories)

    //         return categories;
    //     }

    //     else if (isDefault === true) {
    //         // Return only the default categories
    //         let defaultCategories = await this.defaultCategoryRepo.find();
    //         // Filter by isExpense if the flag is provided
    //         defaultCategories = defaultCategories.filter(category => category.isExpense === isExpense);
    //         return defaultCategories;
    //     }

    //     else if (isDefault === false) {
    //         // Return only the user-specific categories for the given firebaseId
    //         if (!firebaseId || !businessNumber) {
    //             throw new Error('firebaseId and businessNumber must be provided to fetch user-specific categories.');
    //         }
    //         let userCategories = await this.userCategoryRepo.find({ where: { firebaseId, businessNumber } });
    //         // Filter by isExpense if the flag is provided
    //         userCategories = userCategories.filter(category => category.isExpense === isExpense);
    //         return userCategories;
    //     }

    // }
    async getCategories(
        isDefault: boolean | null,
        isExpense: boolean | null,
        firebaseId: string | null,
        businessNumber: string | null
    ): Promise<(UserCategory | DefaultCategory)[]> {

        // helper – שליפת קטגוריות משתמש עם/בלי businessNumber
        const getUserCategories = async (): Promise<UserCategory[]> => {
            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user categories.');
            }

            const where: any = { firebaseId };

            if (businessNumber) {
                where.businessNumber = businessNumber;
            }

            return this.userCategoryRepo.find({ where });
        };

        // ====== MIX: default + user ======
        if (isDefault === null) {
            const defaultCategories = await this.defaultCategoryRepo.find();
            const userCategories = await this.userCategoryRepo.find({ where: { firebaseId, businessNumber } });
            const categoryMap = new Map<string, UserCategory | DefaultCategory>();

            // default first
            defaultCategories.forEach(cat =>
                categoryMap.set(cat.categoryName, cat)
            );

            // user overrides default
            userCategories.forEach(cat =>
                categoryMap.set(cat.categoryName, cat)
            );

            let categories = Array.from(categoryMap.values());

            if (isExpense !== null) {
                categories = categories.filter(c => c.isExpense === isExpense);
            }
            // Filter by isExpense if the flag is provided
            categories = categories.filter(category => category.isExpense === isExpense);

            return categories;
        }

        // ====== ONLY DEFAULT ======
        if (isDefault === true) {
            let defaultCategories = await this.defaultCategoryRepo.find();

            if (isExpense !== null) {
                defaultCategories = defaultCategories.filter(c => c.isExpense === isExpense);
            }

            return defaultCategories;
        }

        // ====== ONLY USER ======
        if (isDefault === false) {
            let userCategories = await getUserCategories();

            if (isExpense !== null) {
                userCategories = userCategories.filter(c => c.isExpense === isExpense);
            }

            return userCategories;
        }

        return [];
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

    /**
     * Resolve a subcategory's report scope (user override wins over default),
     * mirroring getSubCategoryIsEquipment. Returns PNL when the subcategory is
     * unknown — so untagged data behaves exactly as today.
     */
    async getSubCategoryReportScope(
        categoryName: string,
        subCategoryName: string,
        firebaseId?: string | null,
        businessNumber?: string | null,
    ): Promise<ExpenseReportScope> {
        categoryName = categoryName?.trim();
        subCategoryName = subCategoryName?.trim();
        if (!categoryName || !subCategoryName) {
            return ExpenseReportScope.PNL;
        }

        if (firebaseId && businessNumber) {
            const userMatch = await this.userSubCategoryRepo.findOne({
                where: { categoryName, subCategoryName, firebaseId, businessNumber },
                select: { reportScope: true },
            });
            if (userMatch) {
                return userMatch.reportScope ?? ExpenseReportScope.PNL;
            }
        }

        const defaultMatch = await this.defaultSubCategoryRepo.findOne({
            where: { categoryName, subCategoryName },
            select: { reportScope: true },
        });
        return defaultMatch?.reportScope ?? ExpenseReportScope.PNL;
    }

    /**
     * Map of subCategoryName → pnlCategory (user override wins over default),
     * for a given user+business. Used by the P&L report to remap a
     * subcategory's expenses to a different presentation category. Entries
     * with a null/empty pnlCategory are omitted (caller falls back to the
     * bookkeeping category). Mirrors the getSubCategories merge.
     */
    async getPnlCategoryMap(
        firebaseId: string,
        businessNumber: string,
    ): Promise<Map<string, string>> {
        const [userSubs, defaultSubs] = await Promise.all([
            this.userSubCategoryRepo.find({
                where: { firebaseId, businessNumber },
                select: { subCategoryName: true, pnlCategory: true },
            }),
            this.defaultSubCategoryRepo.find({
                select: { subCategoryName: true, pnlCategory: true },
            }),
        ]);

        const map = new Map<string, string>();
        // Defaults first, user overrides win.
        for (const s of defaultSubs) {
            const v = s.pnlCategory?.trim();
            if (v) map.set(s.subCategoryName, v);
        }
        for (const s of userSubs) {
            const v = s.pnlCategory?.trim();
            if (v) map.set(s.subCategoryName, v);
            else map.delete(s.subCategoryName); // user explicitly cleared it
        }
        return map;
    }

    /** Admin: get all default sub-categories (for category management). */
    async getAllDefaultSubCategories(): Promise<DefaultSubCategory[]> {
        return this.defaultSubCategoryRepo.find({ order: { categoryName: 'ASC', subCategoryName: 'ASC' } });
    }

    /** Get all user-specific sub-categories for a given user, optionally scoped to a business. */
    async getAllUserSubCategories(firebaseId: string, businessNumber?: string): Promise<UserSubCategory[]> {
        const where: any = { firebaseId };
        if (businessNumber) where.businessNumber = businessNumber;
        return this.userSubCategoryRepo.find({
            where,
            order: { categoryName: 'ASC', subCategoryName: 'ASC' },
        });
    }

    /** Admin: update a default sub-category by id. */
    async updateDefaultSubCategory(id: number, dto: Partial<DefaultSubCategory>): Promise<DefaultSubCategory> {
        const existing = await this.defaultSubCategoryRepo.findOne({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Default sub-category with id ${id} not found`);
        }
        Object.assign(existing, dto);
        return this.defaultSubCategoryRepo.save(existing);
    }

    /** Admin: delete a default sub-category by id. */
    async deleteDefaultSubCategory(id: number): Promise<void> {
        const existing = await this.defaultSubCategoryRepo.findOne({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Default sub-category with id ${id} not found`);
        }
        await this.defaultSubCategoryRepo.delete(id);
    }

    /** Admin: create a new default sub-category. */
    async createDefaultSubCategory(dto: Partial<DefaultSubCategory>): Promise<DefaultSubCategory> {
        // Upsert parent default_category if it doesn't exist yet
        if (dto.categoryName) {
            const exists = await this.defaultCategoryRepo.findOne({
                where: { categoryName: dto.categoryName },
            });
            if (!exists) {
                await this.defaultCategoryRepo.save(
                    this.defaultCategoryRepo.create({
                        categoryName: dto.categoryName,
                        isExpense: dto.isExpense ?? true,
                    }),
                );
            }
        }

        const entity = this.defaultSubCategoryRepo.create(dto);
        return this.defaultSubCategoryRepo.save(entity);
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string, businessNumber: string) {
        console.log("addSupplier - start");
        console.log("addSupplier - businessNumber:", businessNumber);

        // Check if supplier already exists for this business (not globally)
        const isAlreadyExist = await this.supplier_repo.findOne({ 
            where: { 
                supplier: supplier.supplier,
                businessNumber: businessNumber 
            } 
        });
        console.log("is allready: ", isAlreadyExist);
        if (isAlreadyExist) {
            throw new HttpException({
                status: HttpStatus.CONFLICT,
                error: `Supplier with this name: "${supplier.supplier}" already exists for this business`
            }, HttpStatus.CONFLICT);
        }
        const newSupplier = this.supplier_repo.create(supplier);
        newSupplier.userId = userId;
        newSupplier.businessNumber = businessNumber;
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
        const take = 50;
        const skip = (page - 1) * take;

        const where: any = {
            userId: userId,
            ...(startDate && endDate ? { date: Between(startDate, endDate) } : {}),
            ...(businessNumber ? { businessNumber: businessNumber } : {}),
        };

        console.log('[getExpensesByUserID] where לשאילתה:', JSON.stringify(where, null, 2));

        const result = await this.expense_repo.find({
            where,
            order: { date: 'DESC' },
            take,
            skip,
        });

        console.log('[getExpensesByUserID] מספר הוצאות מהדאטאבייס:', result.length, 'דוגמאות:', result.slice(0, 3).map((e) => ({ id: e.id, date: e.date, businessNumber: e.businessNumber, sum: e.sum })));

        return result;
    }


    async getExpensesForVatReport(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<Expense[]> {

        // IMPORTANT: await the promise!
        const reportedExpenses = await this.getExpensesByDates(userId, businessNumber, startDate, endDate);

        // Attach the RESOLVED P&L category per row so the bookkeeping table can
        // show it without a per-row query. Precedence: per-expense override →
        // subcategory map → null (UI shows "—" = uses bookkeeping category).
        const pnlCategoryMap = await this.getPnlCategoryMap(userId, businessNumber);
        for (const e of reportedExpenses) {
            (e as any).resolvedPnlCategory =
                e.pnlCategory ?? pnlCategoryMap.get(e.subCategory) ?? null;
        }

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


    /**
     * Returns expenses that belong to the report period defined by
     * [startDate, endDate] for `businessNumber`. With the new period-stamp
     * model, an expense is "in the period" if its `vatReportingDate` matches
     * one of the labels that span the range — this catches late stragglers
     * whose `date` falls outside the range but were reassigned to a label
     * inside it. Legacy expenses without a `vatReportingDate` fall back to
     * the original date filter so historical data still appears.
     */
    async getExpensesByDates(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<Expense[]> {
        const business = await this.businessRepo.findOne({
            where: { firebaseId: userId, businessNumber },
        });
        const businessType = business?.businessType ?? BusinessType.EXEMPT;
        const vatReportingType = business?.vatReportingType ?? VATReportingType.NOT_REQUIRED;
        const periodLabels = this.sharedService.expandPeriodLabelsInRange(
            businessType,
            vatReportingType,
            startDate,
            endDate,
        );

        const qb = this.expense_repo
            .createQueryBuilder('expense')
            .where('expense.userId = :userId', { userId })
            .andWhere('expense.businessNumber = :businessNumber', { businessNumber });

        if (periodLabels.length > 0) {
            // Period-stamped expenses → match by label. Legacy (no stamp) →
            // fall back to the original date filter.
            qb.andWhere(
                '(expense.vatReportingDate IN (:...labels) OR (expense.vatReportingDate IS NULL AND expense.date BETWEEN :startDate AND :endDate))',
                { labels: periodLabels, startDate, endDate },
            );
        } else {
            qb.andWhere('expense.date BETWEEN :startDate AND :endDate', { startDate, endDate });
        }

        return qb.getMany();
    }


    async getExpensesForReductionReport(userId: string, businessNumber: string, year: number): Promise<Expense[]> {

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


    /**
     * Update a custom category. Only the simple flag is editable here —
     * renaming is intentionally not supported via PATCH.
     */
    async updateUserCategory(
        firebaseId: string,
        businessNumber: string,
        id: number,
        dto: UpdateUserCategoryDto,
    ): Promise<UserCategory> {
        const cat = await this.userCategoryRepo.findOne({
            where: { id, firebaseId, businessNumber },
        });
        if (!cat) {
            throw new NotFoundException(`User category ${id} not found`);
        }
        Object.assign(cat, dto);
        return this.userCategoryRepo.save(cat);
    }

    /**
     * Update a custom sub-category's parameters (percentages, flags, necessity).
     * Renaming is not supported via PATCH — use delete + add.
     */
    async updateUserSubCategory(
        firebaseId: string,
        businessNumber: string,
        id: number,
        dto: UpdateUserSubCategoryDto,
    ): Promise<UserSubCategory> {
        const sub = await this.userSubCategoryRepo.findOne({
            where: { id, firebaseId, businessNumber },
        });
        if (!sub) {
            throw new NotFoundException(`User sub-category ${id} not found`);
        }
        Object.assign(sub, dto);
        return this.userSubCategoryRepo.save(sub);
    }

    /**
     * Subcategory-wide P&L config, set from the bookkeeping expenses page
     * (applies to ALL of that subcategory's expenses, current and future,
     * since the P&L resolves pnlCategory live from the subcategory).
     *
     * Upserts a UserSubCategory override: if the user already has a row for
     * this (category, subCategory) it is updated; otherwise we clone the
     * matching DefaultSubCategory's attributes into a new user row carrying
     * the override (so the default stays untouched and shared).
     */
    async setSubCategoryReportConfig(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
        subCategoryName: string,
        config: { reportScope?: ExpenseReportScope; pnlCategory?: string | null },
    ): Promise<UserSubCategory> {
        categoryName = categoryName?.trim();
        subCategoryName = subCategoryName?.trim();
        if (!categoryName || !subCategoryName) {
            throw new NotFoundException('categoryName and subCategoryName are required');
        }

        let sub = await this.userSubCategoryRepo.findOne({
            where: { firebaseId, businessNumber, categoryName, subCategoryName },
        });

        if (!sub) {
            const def = await this.defaultSubCategoryRepo.findOne({
                where: { categoryName, subCategoryName },
            });
            sub = this.userSubCategoryRepo.create({
                firebaseId,
                businessNumber,
                categoryName,
                subCategoryName,
                taxPercent: def?.taxPercent ?? 0,
                vatPercent: def?.vatPercent ?? 0,
                reductionPercent: def?.reductionPercent ?? 0,
                isEquipment: def?.isEquipment ?? false,
                isRecognized: def?.isRecognized ?? false,
                isExpense: def?.isExpense ?? true,
                necessity: def?.necessity,
                reportScope: def?.reportScope ?? ExpenseReportScope.PNL,
                pnlCategory: def?.pnlCategory ?? null,
            });
        }

        if (config.reportScope !== undefined) sub.reportScope = config.reportScope;
        if (config.pnlCategory !== undefined) {
            const v = config.pnlCategory?.trim();
            sub.pnlCategory = v ? v : null;
        }
        return this.userSubCategoryRepo.save(sub);
    }

    /**
     * Delete a custom category (and cascade-delete its sub-categories) when
     * no classification rules reference it. Throws ConflictException with the
     * affected rule ids when rules block the delete.
     */
    async deleteUserCategoryCascade(
        firebaseId: string,
        businessNumber: string,
        categoryId: number,
    ): Promise<{ deleted: true }> {
        const category = await this.userCategoryRepo.findOne({
            where: { id: categoryId, firebaseId, businessNumber },
        });
        if (!category) {
            throw new NotFoundException(`User category ${categoryId} not found`);
        }

        const affectedRules = await this.rulesRepo.find({
            where: { userId: firebaseId, category: category.categoryName },
            select: { id: true, transactionName: true, subCategory: true } as any,
        });
        if (affectedRules.length > 0) {
            throw new ConflictException({
                message: 'Category has classification rules referencing it. Delete those rules first.',
                affectedRuleIds: affectedRules.map(r => r.id),
                affectedRules,
            });
        }

        await this.dataSource.transaction(async (manager) => {
            await manager.delete(UserSubCategory, {
                firebaseId,
                businessNumber,
                categoryName: category.categoryName,
            });
            await manager.delete(UserCategory, { id: categoryId });
        });

        return { deleted: true as const };
    }

    /**
     * Delete a custom sub-category when no classification rules reference it.
     * Throws ConflictException with the affected rule ids otherwise.
     */
    async deleteUserSubCategory(
        firebaseId: string,
        businessNumber: string,
        subCategoryId: number,
    ): Promise<{ deleted: true }> {
        const sub = await this.userSubCategoryRepo.findOne({
            where: { id: subCategoryId, firebaseId, businessNumber },
        });
        if (!sub) {
            throw new NotFoundException(`User sub-category ${subCategoryId} not found`);
        }

        const affectedRules = await this.rulesRepo.find({
            where: {
                userId: firebaseId,
                category: sub.categoryName,
                subCategory: sub.subCategoryName,
            },
            select: { id: true, transactionName: true } as any,
        });
        if (affectedRules.length > 0) {
            throw new ConflictException({
                message: 'Sub-category has classification rules referencing it. Delete those rules first.',
                affectedRuleIds: affectedRules.map(r => r.id),
                affectedRules,
            });
        }

        await this.userSubCategoryRepo.delete({ id: subCategoryId });
        return { deleted: true as const };
    }

    /**
     * List the user's custom categories and sub-categories for a single business,
     * grouped by category name. Includes "orphan" sub-categories — sub-categories
     * the user added under a default category (where no UserCategory row exists).
     */
    async getUserCategoriesGrouped(
        firebaseId: string,
        businessNumber: string,
    ): Promise<{
        categoryName: string;
        userCategory: UserCategory | null;
        subCategories: UserSubCategory[];
    }[]> {
        const [categories, subCategories] = await Promise.all([
            this.userCategoryRepo.find({
                where: { firebaseId, businessNumber },
                order: { categoryName: 'ASC' },
            }),
            this.userSubCategoryRepo.find({
                where: { firebaseId, businessNumber },
                order: { categoryName: 'ASC', subCategoryName: 'ASC' },
            }),
        ]);

        const names = new Set<string>();
        categories.forEach(c => names.add(c.categoryName));
        subCategories.forEach(sc => names.add(sc.categoryName));

        return [...names].sort().map(name => ({
            categoryName: name,
            userCategory: categories.find(c => c.categoryName === name) ?? null,
            subCategories: subCategories.filter(sc => sc.categoryName === name),
        }));
    }

    /**
     * Bulk-confirm a batch of OCR-extracted documents as Expenses. For each item:
     *   1) create an Expense row (reuses addExpense for currency/percent logic)
     *   2) optionally create a Supplier row (if saveAsSupplier && supplierID
     *      isn't already in this user's supplier table)
     *   3) mark the source extracted_document.confirmed_expense_id so it falls
     *      out of the review list and can't be confirmed twice.
     * Per-row best-effort: one failure doesn't abort the batch.
     */
    async bulkConfirmFromDrive(
        firebaseId: string,
        businessNumber: string,
        items: BulkConfirmFromDriveItem[],
    ): Promise<{
        results: Array<{ documentId: number; ok: boolean; expenseId?: number; supplierCreated?: boolean; error?: string }>;
        summary: { total: number; succeeded: number; failed: number };
    }> {
        const results: Array<{ documentId: number; ok: boolean; expenseId?: number; supplierCreated?: boolean; error?: string }> = [];

        for (const item of items) {
            try {
                const dto: CreateExpenseDto = {
                    supplier: item.supplier,
                    supplierID: item.supplierID ?? '',
                    expenseNumber: undefined as any,
                    category: item.category,
                    subCategory: item.subCategory,
                    sum: item.sum,
                    taxPercent: item.taxPercent,
                    vatPercent: item.vatPercent,
                    date: new Date(item.date) as any,
                    note: undefined as any,
                    file: undefined as any,
                    reductionPercent: 0,
                    isEquipment: !!item.isEquipment,
                };

                const expense = await this.addExpense(dto, firebaseId, businessNumber);

                // Stamp the report-period label. The drive-extract flow is the
                // only path that pre-computes vatReportingDate at confirm-time
                // — manual addExpense leaves it NULL and falls back to the
                // date-range filter in queries. Honor an explicit override
                // from the UI (user-edited period dropdown) over the date.
                const periodLabel = item.reportPeriod?.trim()
                  || await this.derivePeriodLabelForBusiness(businessNumber, item.date);
                if (periodLabel) {
                    await this.expense_repo.update(expense.id, { vatReportingDate: periodLabel as any });
                }

                let supplierCreated = false;
                if (item.saveAsSupplier && item.supplierID) {
                    const existing = await this.supplier_repo.findOne({
                        where: { userId: firebaseId, supplierID: item.supplierID },
                    });
                    if (!existing) {
                        await this.supplier_repo.save(
                            this.supplier_repo.create({
                                supplier: item.supplier,
                                supplierID: item.supplierID,
                                category: item.category,
                                subCategory: item.subCategory,
                                taxPercent: item.taxPercent,
                                vatPercent: item.vatPercent,
                                userId: firebaseId,
                                businessNumber,
                                isEquipment: !!item.isEquipment,
                                reductionPercent: 0,
                            }),
                        );
                        supplierCreated = true;
                    }
                }

                // Mark the source row as approved so it falls out of the
                // pending_review query AND records the resulting expense id
                // for traceability.
                await this.extractedDocRepo.update(item.documentId, {
                    confirmedExpenseId: expense.id,
                    status: ExtractedDocStatus.APPROVED,
                });

                results.push({ documentId: item.documentId, ok: true, expenseId: expense.id, supplierCreated });
            } catch (err: any) {
                this.logger.error(
                    `bulkConfirmFromDrive: documentId=${item.documentId} failed: ${err?.message ?? err}`,
                    err?.stack,
                );
                results.push({ documentId: item.documentId, ok: false, error: err?.message ?? String(err) });
            }
        }

        const succeeded = results.filter(r => r.ok).length;
        return {
            results,
            summary: { total: items.length, succeeded, failed: items.length - succeeded },
        };
    }

    /**
     * Compute the VAT report-period label for `dateString` using the
     * business's cadence — single ("M/YYYY") or dual-month ("M1-M2/YYYY").
     * Returns null when the business or date can't be resolved (caller then
     * leaves vatReportingDate untouched and relies on the date-range
     * fallback in the report query).
     */
    private async derivePeriodLabelForBusiness(
        businessNumber: string,
        dateString: string,
    ): Promise<string | null> {
        if (!dateString) return null;
        const dt = new Date(dateString);
        if (Number.isNaN(dt.getTime())) return null;
        const business = await this.businessRepo.findOne({ where: { businessNumber } });
        const businessType = business?.businessType ?? BusinessType.LICENSED;
        const vatReportingType = business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;
        return this.sharedService.buildReportPeriodLabel(businessType, vatReportingType, dt);
    }

    /**
     * Pre-flight duplicate detection for the drive-extract flow. For each
     * candidate (supplier + sum + date), check whether the user already has
     * a matching expense in this business. Returns one entry per duplicate,
     * including the existing expense's period label so the UI can tell the
     * user *which* report they previously filed it under.
     *
     * Exact match on date (date-only column), supplier name, and numeric sum
     * — keep it strict so accidental re-uploads are caught but legitimate
     * same-day repeat payments (e.g., two ₪50 fuel receipts) aren't blocked.
     * (Same-supplier, same-sum, same-day is rare enough in practice that the
     * occasional false positive is preferable to silently double-booking.)
     */
    async checkDuplicateExpensesFromDrive(
        firebaseId: string,
        businessNumber: string,
        items: DuplicateExpenseCheckItem[],
    ): Promise<DuplicateExpenseMatch[]> {
        if (!items?.length) return [];

        const business = await this.businessRepo.findOne({ where: { businessNumber } });
        const businessType = business?.businessType ?? BusinessType.LICENSED;
        const vatReportingType = business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;

        const matches: DuplicateExpenseMatch[] = [];
        for (const item of items) {
            if (!item.supplier?.trim() || !item.date || !(Number(item.sum) > 0)) continue;
            const existing = await this.expense_repo.findOne({
                where: {
                    userId: firebaseId,
                    businessNumber,
                    supplier: item.supplier.trim(),
                    sum: Number(item.sum),
                    date: new Date(item.date) as any,
                },
            });
            if (!existing) continue;
            const existingPeriod = existing.vatReportingDate
              ?? this.sharedService.buildReportPeriodLabel(businessType, vatReportingType, new Date(existing.date));
            matches.push({
                documentId: item.documentId,
                existingExpenseId: existing.id,
                existingPeriod: existingPeriod ?? null,
                supplier: item.supplier,
                sum: Number(item.sum),
                date: item.date,
            });
        }
        return matches;
    }

}

export interface BulkConfirmFromDriveItem {
    documentId: number;
    supplier: string;
    supplierID: string | null;
    date: string;          // YYYY-MM-DD
    sum: number;
    category: string;
    subCategory: string;
    vatPercent: number;
    taxPercent: number;
    isEquipment: boolean;
    saveAsSupplier: boolean;
    /** Period label override ("M/YYYY" or "M1-M2/YYYY"). When omitted the
     *  service derives the label from `date` + the business's VAT cadence. */
    reportPeriod?: string | null;
}

export interface DuplicateExpenseCheckItem {
    documentId: number;
    supplier: string;
    sum: number;
    date: string;          // YYYY-MM-DD
}

export interface DuplicateExpenseMatch {
    documentId: number;
    existingExpenseId: number;
    existingPeriod: string | null;
    supplier: string;
    sum: number;
    date: string;
}
