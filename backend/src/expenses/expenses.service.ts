//General
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { User } from '../users/user.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument, ExtractedDocStatus } from '../documents/extracted-document.entity';
import { SharedService } from '../shared/shared.service';
import { FxRateService } from '../shared/fx-rate.service';
import { Business } from 'src/business/business.entity';
import { BusinessType, VATReportingType, ExpenseReportScope, JournalReferenceType, isExemptBusinessType, CategoryType, OwnerType, RecognitionType } from 'src/enum';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { CatalogService, AccountLaw, CatalogScope } from '../bookkeeping/catalog.service';
import { Category } from '../bookkeeping/category.entity';
import { SubCategory } from '../bookkeeping/sub-category.entity';
import { JournalLineInput } from '../bookkeeping/dto/journal-entry-input.interface';
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
            // Kept ONLY for getPnlCategoryMap (D3: pnlCategory namespace is dead,
            // deletion deferred to Phase 4.4 per the master plan) — every other
            // catalog read/write goes through CatalogService as of Phase 2.4.
            @InjectRepository(DefaultSubCategory) private defaultSubCategoryRepo: Repository<DefaultSubCategory>,
            @InjectRepository(UserSubCategory) private userSubCategoryRepo: Repository<UserSubCategory>,
            @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>,
            @InjectRepository(Business) private businessRepo: Repository<Business>,
            @InjectRepository(ClassifiedTransactions) private rulesRepo: Repository<ClassifiedTransactions>,
            @InjectRepository(ExtractedDocument) private extractedDocRepo: Repository<ExtractedDocument>,
            private readonly fxRateService: FxRateService,
            private readonly dataSource: DataSource,
            private readonly bookkeepingService: BookkeepingService,
            private readonly catalogService: CatalogService,
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

        // Fetch business once — used both for the VAT calculation guard and for
        // the VAT-period stamp below. Avoids a second round-trip to the DB.
        const expenseBusiness = await this.businessRepo.findOne({
            where: { businessNumber, firebaseId: userId },
        });

        // Calculate totalVatPayable and totalTaxPayable.
        // Exempt businesses (עוסק פטור / שותפות פטורה) cannot reclaim input
        // VAT. The full sum paid IS the expense — no VAT strip-out. Force
        // vatPercent = 0 here regardless of what the sub-category catalog or
        // the frontend sent, so the P&L shows the correct full amount.
        const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
        if (isExemptBusinessType(expenseBusiness?.businessType) || newExpense.vatPercent === 0) {
            newExpense.vatPercent = 0;
            newExpense.totalVatPayable = 0;
            newExpense.totalTaxPayable = newExpense.sum * (newExpense.taxPercent / 100);
        } else {
            newExpense.totalVatPayable = (newExpense.sum / (1 + vatRate)) * vatRate * (newExpense.vatPercent / 100);
            newExpense.totalTaxPayable = (newExpense.sum - newExpense.totalVatPayable) * (newExpense.taxPercent / 100);
        }

        // Duplicate guard — two tiers, both keyed on (userId, businessNumber,
        // supplier, sum, date). Run AFTER the FX conversion so the `sum`
        // comparison is ILS-on-both-sides (the foreign-currency manual entry
        // block above may have rewritten newExpense.sum from originalSum).
        //
        //   HARD block (DUPLICATE_EXACT) — a match that ALSO shares the
        //     document number (expenseNumber, present on both sides). That's
        //     the literal same invoice; never savable.
        //   SOFT warn (DUPLICATE_WARNING) — same supplier/sum/date but a
        //     different or missing document number. Could be a genuine
        //     same-day repeat purchase (two ₪50 fuel receipts) OR a real
        //     duplicate the user didn't notice. We reject so the UI can ask
        //     "save anyway?"; re-sending with acknowledgeDuplicate=true lets
        //     it through. A missing number on either side stays SOFT — we
        //     can't prove it's the same physical document.
        const trimmedSupplier = newExpense.supplier?.trim();
        if (trimmedSupplier) {
            const matches = await this.expense_repo.find({
                where: {
                    userId,
                    businessNumber,
                    supplier: trimmedSupplier,
                    sum: newExpense.sum,
                    date: newExpense.date as any,
                },
            });
            if (matches.length) {
                const newNumber = newExpense.expenseNumber?.trim();
                const exact = newNumber
                    ? matches.find(m => m.expenseNumber?.trim() === newNumber)
                    : undefined;
                if (exact) {
                    throw new ConflictException({
                        code: 'DUPLICATE_EXACT',
                        message: `הוצאה זו כבר קיימת במערכת, לא ניתן לשמור אותה.`,
                        existingExpenseId: exact.id,
                        existingPeriod: exact.vatReportingDate ?? null,
                    });
                }
                if (!expense.acknowledgeDuplicate) {
                    throw new ConflictException({
                        code: 'DUPLICATE_WARNING',
                        message: `קיימת הוצאה דומה (אותו ספק, סכום ותאריך) — ייתכן שזו כפילות.`,
                        existingExpenseId: matches[0].id,
                        existingPeriod: matches[0].vatReportingDate ?? null,
                    });
                }
                // acknowledgeDuplicate === true → user confirmed; fall through.
            }
        }

        // ── Atomic: save Expense + stamp VAT period + post journal entry ────
        // All three writes run in one transaction so that a journal-entry
        // failure (missing account, counter collision, …) rolls back the
        // Expense save as well — no Expense can exist without its journal entry.
        const resAddExpense = await this.dataSource.transaction(async (manager) => {
            const expRepo = manager.getRepository(Expense);

            const saved = await expRepo.save(newExpense);
            if (!saved || Object.keys(saved).length === 0) {
                throw new Error('expense not saved');
            }

            // Stamp the VAT reporting period inside the transaction so the
            // journal entry (created next) reads the already-stamped value via
            // resolveExpenseVatReportingPeriod → vatReportingDate preference.
            if (expenseBusiness) {
                const periodLabel = this.sharedService.buildReportPeriodLabel(
                    expenseBusiness.businessType,
                    expenseBusiness.vatReportingType,
                    new Date(expense.date ?? saved.loadingDate),
                );
                if (periodLabel) {
                    await expRepo.update(saved.id, { vatReportingDate: periodLabel as any });
                    saved.vatReportingDate = periodLabel as any;
                }
            }

            // Create the journal entry inside the same transaction.
            // createExpenseJournalEntry passes `manager` so it joins here;
            // any failure throws and rolls back the Expense save too.
            const input = await this.buildJournalEntryInput(saved);
            const { entryNumber } = await this.bookkeepingService.createJournalEntry(input, manager);

            // Persist the back-link so future syncs go straight to the entry.
            await expRepo.update(saved.id, { journalEntryNumber: entryNumber });
            saved.journalEntryNumber = entryNumber;

            return saved;
        });

        // Auto-register the supplier in this business's master list. Runs
        // AFTER the Expense save so a Supplier row never lands without its
        // triggering Expense. Idempotent via the (businessNumber, supplierID)
        // find-or-create — a business with 100 monthly Bezeq invoices ends
        // up with one `supplier` row, not 100. Scoped by businessNumber (NOT
        // userId) because the suppliers list endpoint is per-business: with
        // a user-scoped check, biz A's auto-create would block biz B from
        // ever getting its own row. Empty supplierIDs (foreign vendors with
        // no Israeli tax ID) get skipped — there's nothing reliable to
        // deduplicate against, and downstream listings tolerate the absent
        // master row. saveAsSupplier=false skips the whole block — the
        // review modal sets this when the user dismissed the red flag on
        // the row. Best-effort: a failed Supplier save logs and continues
        // — the Expense is already committed and the user shouldn't lose
        // their action because of master-list bookkeeping.
        const supplierIdTrimmed = newExpense.supplierID?.trim();
        if (saveAsSupplier && supplierIdTrimmed) {
            try {
                const existing = await this.supplier_repo.findOne({
                    where: { businessNumber, supplierID: supplierIdTrimmed },
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
                // ER_DUP_ENTRY = the DB's uq_supplier_business_supplierid
                // index caught a race (concurrent tabs / double-click). The
                // sibling request already created the row, so this is a
                // no-op success — log at debug, not warn.
                if (err?.code === 'ER_DUP_ENTRY') {
                    this.logger.debug(
                        `addExpense: Supplier auto-create lost a race for ` +
                        `(biz=${businessNumber}, supplierID=${supplierIdTrimmed}) — sibling won, OK`,
                    );
                } else {
                    this.logger.warn(
                        `addExpense: auto-create Supplier failed (supplierID=${supplierIdTrimmed}, expense=${resAddExpense.id}): ${err?.message ?? err}`,
                    );
                }
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
            const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
            const updateBusiness = await this.businessRepo.findOne({ where: { businessNumber: expense.businessNumber } });
            if (isExemptBusinessType(updateBusiness?.businessType) || expense.vatPercent === 0) {
                expense.vatPercent = 0;
                expense.totalVatPayable = 0;
                expense.totalTaxPayable = expense.sum * (expense.taxPercent / 100);
            } else {
                expense.totalVatPayable = (expense.sum / (1 + vatRate)) * vatRate * (expense.vatPercent / 100);
                expense.totalTaxPayable = (expense.sum - expense.totalVatPayable) * (expense.taxPercent / 100);
            }
        }

        const saved = await this.expense_repo.save({
            ...expense,
            ...updateExpenseDto,
        });

        // Any change to the expense may affect the ledger (amounts, dates,
        // supplier name, account codes). Always sync the full journal entry.
        await this.syncExpenseJournalEntry(saved);

        return saved;
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


    /** Phase 2.4 legacy-shape mappers — the wire contract (categoryName/
     *  subCategoryName field names) stays exactly what the frontend already
     *  expects; only the storage moved to category/sub_category (D1). */
    private toLegacyCategory(cat: Category): any {
        return {
            id: cat.id,
            categoryName: cat.name,
            firebaseId: cat.userId ?? cat.accountantId ?? null,
            businessNumber: cat.businessNumber ?? null,
            isExpense: cat.type === CategoryType.EXPENSE,
            accountCode: null,
        };
    }

    private toLegacySubCategory(sub: SubCategory): any {
        const acc = sub.account ?? null;
        return {
            id: sub.id,
            subCategoryName: sub.name,
            categoryName: sub.category?.name,
            firebaseId: sub.userId ?? sub.accountantId ?? null,
            businessNumber: sub.businessNumber ?? null,
            taxPercent: acc?.taxPercent != null ? Number(acc.taxPercent) : 0,
            vatPercent: acc?.vatPercent != null ? Number(acc.vatPercent) : 0,
            reductionPercent: acc?.reductionPercent != null ? Number(acc.reductionPercent) : 0,
            isEquipment: acc?.isEquipment ?? false,
            isRecognized: sub.isPrivate ? false : acc?.recognitionType === RecognitionType.RECOGNIZED,
            isExpense: sub.category ? sub.category.type === CategoryType.EXPENSE : true,
            necessity: sub.necessity,
            reportScope: sub.reportScope,
            pnlCategory: null, // D3 — pnlCategory string namespace retired, never populated on new rows
            accountCode: acc?.code ?? null,
            subAccountCode: null,
            approvalStatus: sub.approvalStatus,
        };
    }

    /** Reload a just-created/updated sub_category with account/category relations
     *  populated, for the legacy mapper. */
    private async reloadSubCategory(id: number, chartOwnerKey: string): Promise<SubCategory> {
        const sub = await this.catalogService.findSubCategoryInScope(id, chartOwnerKey);
        if (!sub) {
            throw new NotFoundException(`Sub-category ${id} not found`);
        }
        return sub;
    }

    private async getUserCategory(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
    ): Promise<Category | null> {
        return this.catalogService.findCategoryInSingleScope(`CLIENT_${businessNumber}`, categoryName);
    }

    private async saveUserSubCategories(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
        subCategories: CreateUserSubCategoryDto[],
    ): Promise<any[]> {
        if (!subCategories.length) {
            return [];
        }

        const ctx = { userId: firebaseId, businessNumber };
        const scope = this.catalogService.buildScope(OwnerType.CLIENT, ctx);
        // Parent category need not exist in the CLIENT's own scope — it may be
        // a SYSTEM default the client is adding sub-categories under; find or
        // create it in CLIENT scope only when no default of that name exists.
        const category =
            (await this.catalogService.findCategoryByNameInScope(ctx, categoryName)) ??
            (await this.catalogService.findOrCreateCategory(scope, categoryName, CategoryType.EXPENSE, firebaseId));

        const dupNames: string[] = [];
        for (const subDto of subCategories) {
            const existing = await this.catalogService.findSubCategoryInSingleScope(scope.chartOwnerKey, category.id, subDto.subCategoryName);
            if (existing) dupNames.push(subDto.subCategoryName);
        }
        if (dupNames.length) {
            throw new ConflictException({
                message:
                    dupNames.length === 1
                        ? 'תת קטגוריה זו כבר קיימת אצלך (באותה קטגוריית אב)'
                        : 'חלק מתתי הקטגוריות כבר קיימות אצלך (באותה קטגוריית אב)',
                duplicates: dupNames,
            });
        }

        const created: SubCategory[] = [];
        for (const subDto of subCategories) {
            const law: AccountLaw = {
                vatPercent: subDto.vatPercent ?? 0,
                taxPercent: subDto.taxPercent ?? 0,
                reductionPercent: subDto.reductionPercent ?? 0,
                isEquipment: subDto.isEquipment ?? false,
                recognitionType: subDto.isRecognized === false ? RecognitionType.NOT_RECOGNIZED : RecognitionType.RECOGNIZED,
            };
            const sub = await this.catalogService.createSubCategory(scope, category, subDto.subCategoryName, {
                law,
                reportScope: subDto.reportScope ?? ExpenseReportScope.PNL,
                createdByUserId: firebaseId,
            });
            created.push(await this.reloadSubCategory(sub.id, scope.chartOwnerKey));
        }

        return created.map((s) => this.toLegacySubCategory(s));
    }

    async addUserCategory(
        firebaseId: string,
        createUserCategoryDto: CreateUserCategoryDto,
        businessNumber: string
    ): Promise<any[]> {

        // Step 1: Validate that the user exists
        const user = await this.userRepo.findOne({ where: { firebaseId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${firebaseId} not found`);
        }

        const existingCategory = await this.getUserCategory(firebaseId, businessNumber, createUserCategoryDto.categoryName);

        if (existingCategory) {
            throw new ConflictException(`Category with name ${createUserCategoryDto.categoryName} already exists`);
        }

        const ctx = { userId: firebaseId, businessNumber };
        const scope = this.catalogService.buildScope(OwnerType.CLIENT, ctx);
        const type = createUserCategoryDto.isExpense === false ? CategoryType.INCOME : CategoryType.EXPENSE;
        await this.catalogService.findOrCreateCategory(scope, createUserCategoryDto.categoryName, type, firebaseId);

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
    ): Promise<any[]> {
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


    async getCategories(
        isDefault: boolean | null,
        isExpense: boolean | null,
        firebaseId: string | null,
        businessNumber: string | null
    ): Promise<any[]> {
        const type = isExpense === null ? undefined : (isExpense ? CategoryType.EXPENSE : CategoryType.INCOME);

        // ====== MIX: default + user (CLIENT overrides SYSTEM by name, D4) ======
        if (isDefault === null) {
            const categories = await this.catalogService.getMergedCategories({ businessNumber }, type);
            return categories.map((c) => this.toLegacyCategory(c));
        }

        // ====== ONLY DEFAULT (SYSTEM) ======
        if (isDefault === true) {
            const categories = await this.catalogService.findCategoriesByChartOwnerKey('SYSTEM');
            const filtered = type ? categories.filter((c) => c.type === type) : categories;
            return filtered.map((c) => this.toLegacyCategory(c));
        }

        // ====== ONLY USER (CLIENT) ======
        if (isDefault === false) {
            if (!firebaseId) {
                throw new Error('firebaseId must be provided to fetch user categories.');
            }
            if (!businessNumber) {
                return [];
            }
            const categories = await this.catalogService.findCategoriesByChartOwnerKey(`CLIENT_${businessNumber}`);
            const filtered = type ? categories.filter((c) => c.type === type) : categories;
            return filtered.map((c) => this.toLegacyCategory(c));
        }

        return [];
    }



    async getSubCategories(
        firebaseId: string | null,
        isEquipment: boolean | null,
        isExpense: boolean,
        categoryName: string,
        businessNumber: string | null
    ): Promise<any[]> {

        if (!firebaseId || !businessNumber) {
            throw new Error('firebaseId and businessNumber must be provided for user-specific subcategory search.');
        }

        const ctx = { userId: firebaseId, businessNumber };
        const category = await this.catalogService.findCategoryByNameInScope(ctx, categoryName);
        if (!category) {
            return [];
        }

        let subCategories = await this.catalogService.getMergedSubCategories(ctx, category.id);

        if (isEquipment !== null) {
            subCategories = subCategories.filter((s) => (s.account?.isEquipment ?? false) === isEquipment);
        }
        subCategories = subCategories.filter((s) => (s.category ? s.category.type === CategoryType.EXPENSE : true) === isExpense);

        // Sort alphabetically by sub-category name (Hebrew locale) so the
        // classification dropdowns/lists show a stable, ordered list under the
        // parent category header.
        subCategories.sort((a, b) => a.name.localeCompare(b.name, 'he'));

        return subCategories.map((s) => this.toLegacySubCategory(s));
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

        const resolved = await this.catalogService.resolveByName(categoryName, subCategoryName, { userId: firebaseId, businessNumber });
        return resolved?.isEquipment ?? null;
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

        const resolved = await this.catalogService.resolveByName(categoryName, subCategoryName, { userId: firebaseId, businessNumber });
        return resolved?.subCategory?.reportScope ?? ExpenseReportScope.PNL;
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

    /**
     * Resolve the bookkeeping account code for a (category, subCategory) pair.
     * The single source of truth for routing an expense to a כרטיס — used by
     * EVERY expense-creation path (manual entry, OCR document, bank-transaction
     * approval) so they all post to the same account.
     *
     * Phase 2.3: delegates to CatalogService, which resolves against the new
     * category/sub_category/booking_account tables (D1) instead of the old
     * four-table 5-level chain. Signature unchanged so this call site's
     * caller (buildExpenseJournalLines) needed no changes — see
     * CatalogService.resolveAccountCode for the resolution order and the
     * Phase-4 TODO on its fallback behavior.
     */
    async resolveAccountCode(
        categoryName: string,
        subCategoryName: string,
        firebaseId?: string | null,
        businessNumber?: string | null,
    ): Promise<string> {
        return this.catalogService.resolveAccountCode(categoryName, subCategoryName, firebaseId, businessNumber);
    }

    /**
     * Build the single-entry (חד-צידית) expense journal lines for an Expense.
     * Shared by createExpenseJournalEntry (new entry) and syncExpenseJournalEntry
     * (replace lines on re-classification) so both produce identical structure.
     *
     * Lines: debit the resolved expense account (net before VAT) plus deductible
     * VAT input (2410) when present; no-VAT expenses debit the whole amount to
     * the expense account. No contra cash/A/P (1000) line.
     */
    private async buildExpenseJournalLines(expense: Expense): Promise<JournalLineInput[]> {
        const total = Number(expense.sum) || 0;
        // totalVatPayable = deductible VAT input (VAT × deductibility); 0 when
        // vatPercent = 0. Computed by the caller before save.
        const vatInput = Number(expense.totalVatPayable) || 0;
        const hasVat = vatInput > 0;
        const net = Number((total - vatInput).toFixed(2));

        const expenseAccountCode = await this.resolveAccountCode(
            expense.category, expense.subCategory, expense.userId, expense.businessNumber,
        );

        const isEquipment = expense.isEquipment ?? false;
        const taxPct = Number(expense.taxPercent) || 0;
        const vatPct  = Number(expense.vatPercent)  || 0;
        const amountForTax = Number(expense.totalTaxPayable) || 0;

        return hasVat
            ? [
                // Expense line: net amount (total – deductible VAT)
                {
                    accountCode: expenseAccountCode,
                    debit: net, amountBeforeVat: net, vatAmount: 0, isEquipment,
                    taxPercent: taxPct, vatPercent: vatPct, amountForTax,
                    subCategoryName: expense.subCategory ?? null,
                },
                // Input VAT line: deductible VAT portion
                {
                    accountCode: '2410',
                    debit: vatInput, amountBeforeVat: 0, vatAmount: vatInput, isEquipment,
                    taxPercent: 0, vatPercent: vatPct, amountForTax: 0,
                    subCategoryName: null,
                },
                // Bank credit: full payment (net + deductible VAT = total); balance the entry
                {
                    accountCode: '1100',
                    credit: total, amountBeforeVat: net, vatAmount: vatInput, isEquipment: false,
                    taxPercent: 0, vatPercent: 0, amountForTax: 0,
                    subCategoryName: null,
                },
            ]
            : [
                // No-VAT expense: full sum
                {
                    accountCode: expenseAccountCode,
                    debit: total, amountBeforeVat: total, vatAmount: 0, isEquipment,
                    taxPercent: taxPct, vatPercent: 0, amountForTax,
                    subCategoryName: expense.subCategory ?? null,
                },
                // Bank credit: full payment
                {
                    accountCode: '1100',
                    credit: total, amountBeforeVat: total, vatAmount: 0, isEquipment: false,
                    taxPercent: 0, vatPercent: 0, amountForTax: 0,
                    subCategoryName: null,
                },
            ];
    }

    /**
     * Build the full JournalEntryInput for an expense.
     * Shared between createExpenseJournalEntry (new entry) and
     * syncExpenseJournalEntry (update existing entry) so both produce
     * identical data from the same expense state.
     */
    private async buildJournalEntryInput(expense: Expense): Promise<import('../bookkeeping/dto/journal-entry-input.interface').JournalEntryInput> {
        const journalLines = await this.buildExpenseJournalLines(expense);
        const expenseDateSql = this.sharedService.normalizeToMySqlDate(expense.date);
        const vatReportingPeriod = await this.resolveExpenseVatReportingPeriod(expense);
        return {
            firebaseId: expense.userId,
            issuerBusinessNumber: expense.businessNumber,
            subCategory: expense.subCategory ?? null,
            counterAccountCode: '1100',
            counterPartyName: expense.supplier ?? null,
            documentTotal: expense.sum,
            date: expenseDateSql,
            valueDate: expenseDateSql,
            vatDate: expenseDateSql,
            vatReportingPeriod,
            referenceType: JournalReferenceType.EXPENSE,
            referenceId: Number(expense.expenseNumber) || expense.id,
            description: `EXPENSE #${expense.expenseNumber ?? expense.id} - ${expense.supplier ?? ''}`,
            lines: journalLines,
        };
    }

    /**
     * Post the single-entry (חד-צידית) expense journal entry for an already-saved
     * Expense. Best-effort — logs on failure so the already-committed Expense is
     * never lost. On success, saves the entryNumber back to expense.journalEntryNumber.
     * Returns the entryNumber on success, null on failure.
     *
     * For the atomic creation path (inside addExpense's transaction), pass a
     * transactional `manager`; the journal entry will participate in that
     * transaction and a failure will roll back the Expense save too.
     */
    async createExpenseJournalEntry(expense: Expense, manager?: import('typeorm').EntityManager): Promise<number | null> {
        try {
            const input = await this.buildJournalEntryInput(expense);
            const { entryNumber } = await this.bookkeepingService.createJournalEntry(input, manager);
            // Persist the link back so future syncs can find the entry by entryNumber.
            const repo = manager ? manager.getRepository(Expense) : this.expense_repo;
            await repo.update(expense.id, { journalEntryNumber: entryNumber });
            expense.journalEntryNumber = entryNumber;
            return entryNumber;
        } catch (err: any) {
            this.logger.warn(
                `createExpenseJournalEntry: failed for expense ${expense.id}: ${err?.message ?? err}`,
            );
            return null;
        }
    }

    /**
     * Resolve the VAT reporting-period label for an expense's journal entry.
     * Prefers the stamp already on the Expense (set by the bank/OCR paths);
     * otherwise derives it from the business cadence + expense date, matching
     * exactly how getExpensesByDates buckets the row. Returns null only when the
     * business can't be resolved and the Expense carries no stamp.
     */
    private async resolveExpenseVatReportingPeriod(expense: Expense): Promise<string | null> {
        if (expense.vatReportingDate) return expense.vatReportingDate as string;
        const business = await this.businessRepo.findOne({
            where: { businessNumber: expense.businessNumber, firebaseId: expense.userId },
        });
        if (!business) return null;
        return this.sharedService.buildReportPeriodLabel(
            business.businessType,
            business.vatReportingType,
            new Date(expense.date),
        );
    }

    /**
     * Re-sync an expense's journal entry after any field change. Updates
     * BOTH the header (date, supplier, amounts, period) AND the lines
     * (account codes, debit/credit splits) of the existing entry so the
     * ledger always matches the expense. Best-effort — logs and returns on
     * failure so the already-saved Expense is never rolled back.
     *
     * Lookup order:
     *   1. expense.journalEntryNumber — fast, stable, preferred.
     *   2. Backward compat: (referenceType=EXPENSE, referenceId=expense.id,
     *      businessNumber) — for rows created before journalEntryNumber was
     *      added. On success the entryNumber is saved back to the Expense.
     *   3. If no entry found at all → create a fresh journal entry.
     */
    async syncExpenseJournalEntry(expense: Expense): Promise<void> {
        try {
            const input = await this.buildJournalEntryInput(expense);

            // Path 1: preferred lookup by entryNumber.
            if (expense.journalEntryNumber != null) {
                const updated = await this.bookkeepingService.updateJournalEntryFull(
                    expense.journalEntryNumber,
                    expense.businessNumber,
                    input,
                );
                if (updated) return;
                this.logger.warn(
                    `syncExpenseJournalEntry: entryNumber ${expense.journalEntryNumber} not found ` +
                    `for expense ${expense.id} — falling back to reference lookup`,
                );
            }

            // Path 2: backward compat — find by referenceType + referenceId.
            const existingEntryNumber = await this.bookkeepingService.findJournalEntryNumber(
                JournalReferenceType.EXPENSE,
                expense.id,
                expense.businessNumber,
            );
            if (existingEntryNumber != null) {
                await this.bookkeepingService.updateJournalEntryFull(
                    existingEntryNumber,
                    expense.businessNumber,
                    input,
                );
                // Persist the link for all future syncs.
                await this.expense_repo.update(expense.id, { journalEntryNumber: existingEntryNumber });
                expense.journalEntryNumber = existingEntryNumber;
                return;
            }

            // Path 3: no entry at all → create one.
            await this.createExpenseJournalEntry(expense);
        } catch (err: any) {
            this.logger.warn(
                `syncExpenseJournalEntry: failed for expense ${expense.id}: ${err?.message ?? err}`,
            );
        }
    }

    /** Admin: get all default (SYSTEM) sub-categories (for category management). */
    async getAllDefaultSubCategories(): Promise<any[]> {
        const subCategories = await this.catalogService.findSubCategoriesByChartOwnerKey('SYSTEM');
        subCategories.sort((a, b) => {
            const catCmp = (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'he');
            return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name, 'he');
        });
        return subCategories.map((s) => this.toLegacySubCategory(s));
    }

    /** Get all user-specific (CLIENT) sub-categories for a given user, optionally scoped to a business. */
    async getAllUserSubCategories(firebaseId: string, businessNumber?: string): Promise<any[]> {
        if (!businessNumber) return [];
        const subCategories = await this.catalogService.findSubCategoriesByChartOwnerKey(`CLIENT_${businessNumber}`);
        subCategories.sort((a, b) => {
            const catCmp = (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'he');
            return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name, 'he');
        });
        return subCategories.map((s) => this.toLegacySubCategory(s));
    }

    /** Admin: update a default (SYSTEM) sub-category by id — accepts the same
     *  legacy-shaped body (subCategoryName/taxPercent/vatPercent/...); percent
     *  fields resolve to a SYSTEM-scoped card via CatalogService, same as the
     *  CLIENT path (see updateUserSubCategory). */
    async updateDefaultSubCategory(id: number, dto: any): Promise<any> {
        const existing = await this.catalogService.findSubCategoryInScope(id, 'SYSTEM');
        if (!existing) {
            throw new NotFoundException(`Default sub-category with id ${id} not found`);
        }

        if (dto.necessity !== undefined) existing.necessity = dto.necessity;
        if (dto.reportScope !== undefined) existing.reportScope = dto.reportScope;

        const hasLawFields = ['vatPercent', 'taxPercent', 'reductionPercent', 'isEquipment', 'isRecognized'].some(
            (k) => dto[k] !== undefined,
        );
        if (hasLawFields) {
            const scope = this.catalogService.buildScope(OwnerType.SYSTEM, {});
            const current = existing.account;
            const law: AccountLaw = {
                vatPercent: dto.vatPercent ?? current?.vatPercent ?? 0,
                taxPercent: dto.taxPercent ?? current?.taxPercent ?? 0,
                reductionPercent: dto.reductionPercent ?? current?.reductionPercent ?? 0,
                isEquipment: dto.isEquipment ?? current?.isEquipment ?? false,
                recognitionType:
                    dto.isRecognized === false
                        ? RecognitionType.NOT_RECOGNIZED
                        : dto.isRecognized === true
                          ? RecognitionType.RECOGNIZED
                          : (current?.recognitionType ?? RecognitionType.RECOGNIZED),
            };
            await this.catalogService.updateSubCategoryLaw(existing, scope, law);
        } else {
            await this.catalogService.saveSubCategory(existing);
        }

        return this.toLegacySubCategory(await this.reloadSubCategory(id, 'SYSTEM'));
    }

    /** Admin: delete a default (SYSTEM) sub-category by id (soft delete —
     *  isActive=false, per Phase 2.4's review correction). Blocked when
     *  classified_transactions rules reference it (SYSTEM names ARE
     *  referenced by client rules — this check was missing pre-port). */
    async deleteDefaultSubCategory(id: number): Promise<void> {
        const existing = await this.catalogService.findSubCategoryInScope(id, 'SYSTEM');
        if (!existing) {
            throw new NotFoundException(`Default sub-category with id ${id} not found`);
        }

        const affectedRules = await this.rulesRepo.find({
            where: { category: existing.category?.name, subCategory: existing.name },
            select: { id: true, transactionName: true, subCategory: true } as any,
        });
        if (affectedRules.length > 0) {
            throw new ConflictException({
                message: 'Sub-category has classification rules referencing it. Delete those rules first.',
                affectedRuleIds: affectedRules.map((r) => r.id),
                affectedRules,
            });
        }

        await this.catalogService.deleteSubCategory(existing);
    }

    /** Admin: create a new default (SYSTEM) sub-category, same legacy body
     *  shape as before (auto-creates the parent SYSTEM category if missing). */
    async createDefaultSubCategory(dto: any): Promise<any> {
        const scope = this.catalogService.buildScope(OwnerType.SYSTEM, {});
        const type = dto.isExpense === false ? CategoryType.INCOME : CategoryType.EXPENSE;
        const category = await this.catalogService.findOrCreateCategory(scope, dto.categoryName, type);

        const law: AccountLaw = {
            vatPercent: dto.vatPercent ?? 0,
            taxPercent: dto.taxPercent ?? 0,
            reductionPercent: dto.reductionPercent ?? 0,
            isEquipment: dto.isEquipment ?? false,
            recognitionType: dto.isRecognized === false ? RecognitionType.NOT_RECOGNIZED : RecognitionType.RECOGNIZED,
        };
        const sub = await this.catalogService.createSubCategory(scope, category, dto.subCategoryName, {
            law,
            reportScope: dto.reportScope ?? ExpenseReportScope.PNL,
        });
        return this.toLegacySubCategory(await this.reloadSubCategory(sub.id, 'SYSTEM'));
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////               Suppliers             /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////


    async addSupplier(supplier: Partial<Supplier>, userId: string, businessNumber: string) {
        // Dedup priority: supplierID is the legal identity (tax ID), so
        // when present it's the conflict key — two suppliers with the same
        // display name but different tax IDs are different real entities
        // (e.g. two stores under the same chain brand) and BOTH should be
        // allowed. When supplierID is empty (cash vendor, foreign merchant)
        // fall back to name-uniqueness so users don't accidentally create
        // "אנונימי" twice.
        const supplierIdTrimmed = supplier.supplierID?.trim();
        const existing = supplierIdTrimmed
            ? await this.supplier_repo.findOne({
                  where: { businessNumber, supplierID: supplierIdTrimmed },
              })
            : await this.supplier_repo.findOne({
                  where: { businessNumber, supplier: supplier.supplier },
              });
        if (existing) {
            const reason = supplierIdTrimmed
                ? `supplierID "${supplierIdTrimmed}"`
                : `name "${supplier.supplier}"`;
            throw new HttpException({
                status: HttpStatus.CONFLICT,
                error: `Supplier with ${reason} already exists for this business`
            }, HttpStatus.CONFLICT);
        }
        const newSupplier = this.supplier_repo.create(supplier);
        newSupplier.userId = userId;
        newSupplier.businessNumber = businessNumber;
        if (supplierIdTrimmed) newSupplier.supplierID = supplierIdTrimmed;
        try {
            return await this.supplier_repo.save(newSupplier);
        } catch (err: any) {
            // The pre-check above resolves the common case, but a concurrent
            // request can still race past it. The DB's uq_supplier_business_
            // supplierid index turns that race into ER_DUP_ENTRY — surface as
            // a 409 instead of letting it bubble up as a 500.
            if (err?.code === 'ER_DUP_ENTRY') {
                throw new HttpException({
                    status: HttpStatus.CONFLICT,
                    error: supplierIdTrimmed
                        ? `Supplier with supplierID "${supplierIdTrimmed}" already exists for this business`
                        : `Supplier with name "${supplier.supplier}" already exists for this business`,
                }, HttpStatus.CONFLICT);
            }
            throw err;
        }
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
        // subcategory map → bookkeeping category. This mirrors the actual P&L
        // report grouping (reports.service.ts), so the column shows the real
        // category the expense rolls up under instead of a bare "—".
        const pnlCategoryMap = await this.getPnlCategoryMap(userId, businessNumber);
        for (const e of reportedExpenses) {
            (e as any).resolvedPnlCategory =
                e.pnlCategory ?? pnlCategoryMap.get(e.subCategory) ?? e.category;
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
    ): Promise<any> {
        const chartOwnerKey = `CLIENT_${businessNumber}`;
        const cat = await this.catalogService.findCategoryInScope(id, chartOwnerKey);
        if (!cat) {
            throw new NotFoundException(`User category ${id} not found`);
        }
        if (dto.isExpense !== undefined) {
            cat.type = dto.isExpense ? CategoryType.EXPENSE : CategoryType.INCOME;
        }
        return this.toLegacyCategory(await this.catalogService.saveCategory(cat));
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
    ): Promise<any> {
        const chartOwnerKey = `CLIENT_${businessNumber}`;
        const sub = await this.catalogService.findSubCategoryInScope(id, chartOwnerKey);
        if (!sub) {
            throw new NotFoundException(`User sub-category ${id} not found`);
        }

        if (dto.necessity !== undefined) sub.necessity = dto.necessity;
        if (dto.reportScope !== undefined) sub.reportScope = dto.reportScope;

        const hasLawFields = ['vatPercent', 'taxPercent', 'reductionPercent', 'isEquipment', 'isRecognized'].some(
            (k) => (dto as any)[k] !== undefined,
        );
        if (hasLawFields) {
            const scope = this.catalogService.buildScope(OwnerType.CLIENT, { userId: firebaseId, businessNumber });
            const current = sub.account;
            const law: AccountLaw = {
                vatPercent: dto.vatPercent ?? current?.vatPercent ?? 0,
                taxPercent: dto.taxPercent ?? current?.taxPercent ?? 0,
                reductionPercent: dto.reductionPercent ?? current?.reductionPercent ?? 0,
                isEquipment: dto.isEquipment ?? current?.isEquipment ?? false,
                recognitionType:
                    (dto as any).isRecognized === false
                        ? RecognitionType.NOT_RECOGNIZED
                        : (dto as any).isRecognized === true
                          ? RecognitionType.RECOGNIZED
                          : (current?.recognitionType ?? RecognitionType.RECOGNIZED),
            };
            await this.catalogService.updateSubCategoryLaw(sub, scope, law);
        } else {
            await this.catalogService.saveSubCategory(sub);
        }

        return this.toLegacySubCategory(await this.reloadSubCategory(id, chartOwnerKey));
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
    /**
     * D3 note: `config.pnlCategory` is accepted for wire compatibility but
     * ignored — the pnlCategory string namespace is retired (accounting_
     * section replaces it); deleting the field entirely is Phase 4.4 scope.
     */
    async setSubCategoryReportConfig(
        firebaseId: string,
        businessNumber: string,
        categoryName: string,
        subCategoryName: string,
        config: { reportScope?: ExpenseReportScope; pnlCategory?: string | null },
    ): Promise<any> {
        categoryName = categoryName?.trim();
        subCategoryName = subCategoryName?.trim();
        if (!categoryName || !subCategoryName) {
            throw new NotFoundException('categoryName and subCategoryName are required');
        }

        const ctx = { userId: firebaseId, businessNumber };
        const scope = this.catalogService.buildScope(OwnerType.CLIENT, ctx);
        const chartOwnerKey = scope.chartOwnerKey;

        const category =
            (await this.catalogService.findCategoryByNameInScope(ctx, categoryName)) ??
            (await this.catalogService.findOrCreateCategory(scope, categoryName, CategoryType.EXPENSE, firebaseId));

        let sub = await this.catalogService.findSubCategoryInSingleScope(chartOwnerKey, category.id, subCategoryName);

        if (!sub) {
            // Clone the merged (CLIENT>SYSTEM) row's current law into a fresh
            // CLIENT override, same "clone-on-first-write" behavior as before.
            const merged = await this.catalogService.findSubCategoryByNameInScope(ctx, category.id, subCategoryName);
            const law: AccountLaw = {
                vatPercent: merged?.account?.vatPercent ?? 0,
                taxPercent: merged?.account?.taxPercent ?? 0,
                reductionPercent: merged?.account?.reductionPercent ?? 0,
                isEquipment: merged?.account?.isEquipment ?? false,
                recognitionType: merged?.account?.recognitionType ?? RecognitionType.RECOGNIZED,
            };
            sub = await this.catalogService.createSubCategory(scope, category, subCategoryName, {
                isPrivate: merged?.isPrivate ?? false,
                law: merged?.isPrivate ? undefined : law,
                accountId: merged?.isPrivate ? null : undefined,
                necessity: merged?.necessity,
                reportScope: merged?.reportScope ?? ExpenseReportScope.PNL,
                createdByUserId: firebaseId,
            });
        }

        if (config.reportScope !== undefined) sub.reportScope = config.reportScope;
        await this.catalogService.saveSubCategory(sub);

        return this.toLegacySubCategory(await this.reloadSubCategory(sub.id, chartOwnerKey));
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
        const chartOwnerKey = `CLIENT_${businessNumber}`;
        const category = await this.catalogService.findCategoryInScope(categoryId, chartOwnerKey);
        if (!category) {
            throw new NotFoundException(`User category ${categoryId} not found`);
        }

        const affectedRules = await this.rulesRepo.find({
            where: { userId: firebaseId, category: category.name },
            select: { id: true, transactionName: true, subCategory: true } as any,
        });
        if (affectedRules.length > 0) {
            throw new ConflictException({
                message: 'Category has classification rules referencing it. Delete those rules first.',
                affectedRuleIds: affectedRules.map(r => r.id),
                affectedRules,
            });
        }

        const subCategories = await this.catalogService.getMergedSubCategories({ businessNumber }, categoryId);
        for (const sub of subCategories.filter((s) => s.chartOwnerKey === chartOwnerKey)) {
            await this.catalogService.deleteSubCategory(sub);
        }
        await this.catalogService.deleteCategory(category);

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
        const chartOwnerKey = `CLIENT_${businessNumber}`;
        const sub = await this.catalogService.findSubCategoryInScope(subCategoryId, chartOwnerKey);
        if (!sub) {
            throw new NotFoundException(`User sub-category ${subCategoryId} not found`);
        }

        const affectedRules = await this.rulesRepo.find({
            where: {
                userId: firebaseId,
                category: sub.category?.name,
                subCategory: sub.name,
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

        await this.catalogService.deleteSubCategory(sub);
        return { deleted: true as const };
    }

    /**
     * List the user's custom categories and sub-categories for a single business,
     * grouped by category name. Includes "orphan" sub-categories — sub-categories
     * the user added under a default category (where no CLIENT category row exists).
     */
    async getUserCategoriesGrouped(
        firebaseId: string,
        businessNumber: string,
    ): Promise<{
        categoryName: string;
        userCategory: any | null;
        subCategories: any[];
    }[]> {
        const chartOwnerKey = `CLIENT_${businessNumber}`;
        const [categories, subCategories] = await Promise.all([
            this.catalogService.findCategoriesByChartOwnerKey(chartOwnerKey),
            this.catalogService.findSubCategoriesByChartOwnerKey(chartOwnerKey),
        ]);

        const names = new Set<string>();
        categories.forEach(c => names.add(c.name));
        subCategories.forEach(sc => names.add(sc.category?.name ?? ''));

        return [...names].filter(Boolean).sort().map(name => ({
            categoryName: name,
            userCategory: categories.find(c => c.name === name) ? this.toLegacyCategory(categories.find(c => c.name === name)!) : null,
            subCategories: subCategories.filter(sc => sc.category?.name === name).map((s) => this.toLegacySubCategory(s)),
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
                    // Per-business dedup — matches addExpense's auto-create
                    // and the suppliers-list endpoint (both scope by
                    // businessNumber). userId-scoped lookup would block biz
                    // B from getting a Bezeq row if biz A already had one.
                    try {
                        const existing = await this.supplier_repo.findOne({
                            where: { businessNumber, supplierID: item.supplierID },
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
                    } catch (sErr: any) {
                        // Race with a sibling create (e.g. user double-
                        // clicked approve, two tabs, parallel rows in the
                        // same bulk). The DB index already enforces the
                        // invariant — treat ER_DUP_ENTRY as "sibling won",
                        // not a failure. The Expense above is already
                        // committed and the doc is about to be marked
                        // APPROVED — losing this supplier-master write
                        // shouldn't fail the row.
                        if (sErr?.code !== 'ER_DUP_ENTRY') throw sErr;
                        this.logger.debug(
                            `bulkConfirm: Supplier auto-create lost a race for ` +
                            `(biz=${businessNumber}, supplierID=${item.supplierID}) — sibling won, OK`,
                        );
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
