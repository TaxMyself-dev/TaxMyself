//General
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
//Entities
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { User } from '../users/user.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument, ExtractedDocStatus } from '../documents/extracted-document.entity';
import { SharedService } from '../shared/shared.service';
import { FxRateService } from '../shared/fx-rate.service';
import { Business } from 'src/business/business.entity';
import { ReportWorkflow, ReportWorkflowStatus, ReportWorkflowType } from '../report-workflow/report-workflow.entity';
import { BusinessType, VATReportingType, ExpenseReportScope, ExpenseApprovalStatus, ApprovalStatus, JournalReferenceType, isExemptBusinessType, CategoryType, OwnerType, RecognitionType } from 'src/enum';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { CatalogService, AccountLaw, CatalogScope, ResolvedSubCategory } from '../bookkeeping/catalog.service';
import { CatalogContextService } from '../bookkeeping/catalog-context.service';
import { Category } from '../bookkeeping/category.entity';
import { SubCategory } from '../bookkeeping/sub-category.entity';
import { JournalLineInput } from '../bookkeeping/dto/journal-entry-input.interface';
import { buildExpenseDescription, DescriptionDocInput } from './expense-description.util';
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
            @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>,
            @InjectRepository(Business) private businessRepo: Repository<Business>,
            @InjectRepository(ClassifiedTransactions) private rulesRepo: Repository<ClassifiedTransactions>,
            @InjectRepository(ExtractedDocument) private extractedDocRepo: Repository<ExtractedDocument>,
            // Entity-only registration (module import would be cyclic:
            // ReportWorkflowModule -> ReportsModule -> ExpensesModule).
            @InjectRepository(ReportWorkflow) private reportWorkflowRepo: Repository<ReportWorkflow>,
            private readonly fxRateService: FxRateService,
            private readonly dataSource: DataSource,
            private readonly bookkeepingService: BookkeepingService,
            private readonly catalogService: CatalogService,
            private readonly catalogContextService: CatalogContextService,
        ) { }


    // =========================================================================
    // Phase 4.1 — classification resolution on the D1 model. Every expense
    // write path (manual add, review-modal approve, update, slim re-sync)
    // funnels through resolveExpenseClassification + applyClassificationToExpense
    // so subCategoryId, the accounting snapshots, description (D7) and
    // approvalStatus are always written together and always consistent.
    // =========================================================================

    /**
     * Resolve a classification input (subCategoryId preferred, legacy name
     * pair as fallback) to the full accounting law + the enforcement verdict:
     *
     *   | resolution                                    | approvalStatus              | journal |
     *   |-----------------------------------------------|-----------------------------|---------|
     *   | account present, sub APPROVED, not private    | APPROVED                    | yes     |
     *   | no account / sub MISSING / PENDING / REJECTED | MISSING_ACCOUNTING_MAPPING  | no      |
     *   | isPrivate                                     | APPROVED                    | never   |
     *   | unresolvable                                  | 400 (the 60000 fallback is dead) |    |
     */
    private async resolveExpenseClassification(
        input: { subCategoryId?: number | null; category?: string | null; subCategory?: string | null },
        businessNumber: string,
        /** The expense OWNER's firebaseId — drives the delegation lookup that
         *  makes the ACCOUNTANT catalog layer visible (Phase 5.1, D4). */
        ownerUserId?: string | null,
    ): Promise<{ resolved: ResolvedSubCategory; approvalStatus: ExpenseApprovalStatus; journalable: boolean }> {
        const ctx = await this.catalogContextService.forUser(ownerUserId, businessNumber);
        let resolved: ResolvedSubCategory | null = null;
        if (input.subCategoryId != null) {
            // Tenant-scope-checked: an id outside this business's merged catalog 404s.
            resolved = await this.catalogService.resolveSubCategory(input.subCategoryId, ctx);
        } else if (input.category?.trim() && input.subCategory?.trim()) {
            resolved = await this.catalogService.resolveByName(input.category, input.subCategory, ctx);
        }

        if (!resolved) {
            throw new BadRequestException(
                `סיווג לא מזוהה: "${input.category ?? ''}/${input.subCategory ?? ''}" — יש לבחור תת-קטגוריה מהקטלוג`,
            );
        }

        if (resolved.subCategory.isPrivate) {
            // D5: private — approved, but never journaled and never mapped.
            return { resolved, approvalStatus: ExpenseApprovalStatus.APPROVED, journalable: false };
        }
        const mapped =
            resolved.account != null &&
            resolved.subCategory.approvalStatus === ApprovalStatus.APPROVED;
        return mapped
            ? { resolved, approvalStatus: ExpenseApprovalStatus.APPROVED, journalable: true }
            : { resolved, approvalStatus: ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING, journalable: false };
    }

    /**
     * Write the resolved classification onto the expense: FK + canonical legacy
     * name strings + accounting snapshots + law percents (DTO-explicit values
     * win as one-off snapshot overrides — transition rule until Phase 6) +
     * reportScope + description (D7) + approvalStatus stamps.
     */
    private applyClassificationToExpense(
        expense: Expense,
        rc: { resolved: ResolvedSubCategory; approvalStatus: ExpenseApprovalStatus; journalable: boolean },
        dtoOverrides: {
            vatPercent?: number | null;
            taxPercent?: number | null;
            reductionPercent?: number | null;
            isEquipment?: boolean | null;
            reportScope?: ExpenseReportScope | null;
        },
        actingUserId: string,
        doc?: DescriptionDocInput | null,
    ): void {
        const { resolved, approvalStatus } = rc;
        const sub = resolved.subCategory;

        expense.subCategoryId = sub.id;
        // Canonical legacy strings — the merged-catalog row's names, not the
        // caller's raw input (CLIENT override may differ in casing/spacing).
        expense.category = sub.category?.name ?? expense.category;
        expense.subCategory = sub.name ?? expense.subCategory;

        expense.sectionIdSnapshot = resolved.section?.id ?? null;
        expense.sectionCodeSnapshot = resolved.section?.code ?? null;
        expense.sectionNameSnapshot = resolved.section?.name ?? null;
        expense.accountIdSnapshot = resolved.account?.id ?? null;
        expense.accountCodeSnapshot = resolved.account?.code ?? null;
        expense.accountNameSnapshot = resolved.account?.name ?? null;
        expense.code6111Snapshot = resolved.code6111 ?? null;

        // Card law, unless the DTO sent an explicit one-off override.
        expense.vatPercentSnapshot = dtoOverrides.vatPercent ?? Number(resolved.vatPercent ?? 0);
        expense.taxPercentSnapshot = dtoOverrides.taxPercent ?? Number(resolved.taxPercent ?? 0);
        expense.reductionPercentSnapshot = dtoOverrides.reductionPercent ?? Number(resolved.reductionPercent ?? 0);
        expense.isEquipmentSnapshot = dtoOverrides.isEquipment ?? (resolved.isEquipment ?? false);

        expense.reportScope = dtoOverrides.reportScope ?? sub.reportScope ?? ExpenseReportScope.PNL;

        expense.description = buildExpenseDescription(
            { category: expense.category, subCategory: expense.subCategory },
            doc,
        );

        expense.approvalStatus = approvalStatus;
        if (approvalStatus === ExpenseApprovalStatus.APPROVED) {
            expense.approvedByUserId = actingUserId;
            expense.approvedAt = new Date();
        } else {
            expense.approvedByUserId = null;
            expense.approvedAt = null;
        }
    }

    /**
     * VAT/tax payable recomputation from sum + percent snapshots. Exempt
     * businesses can't reclaim input VAT — vatPercent is forced to 0 and the
     * full sum is the expense.
     */
    private recomputeExpenseTotals(expense: Expense, businessType: BusinessType | null | undefined): void {
        const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
        if (isExemptBusinessType(businessType) || Number(expense.vatPercentSnapshot) === 0) {
            expense.vatPercentSnapshot = 0;
            expense.totalVatPayable = 0;
            expense.totalTaxPayable = expense.sum * (Number(expense.taxPercentSnapshot) / 100);
        } else {
            expense.totalVatPayable = (expense.sum / (1 + vatRate)) * vatRate * (Number(expense.vatPercentSnapshot) / 100);
            expense.totalTaxPayable = (expense.sum - expense.totalVatPayable) * (Number(expense.taxPercentSnapshot) / 100);
        }
    }

    /**
     * D10 period lock. Throws 423 (`type: 'expense_period_locked'`, mirroring
     * the transaction-side `natural_period_locked` contract) when the expense
     * belongs to an already-REPORTED VAT period:
     *   1. `isReported === true` (stamped live by report-workflow lock), OR
     *   2. its `vatReportingDate` matches a REPORTED VAT workflow's period, OR
     *   3. (no vatReportingDate, JOURNALED rows only) its `date` falls inside
     *      a REPORTED period — exempt-dealer expenses with no VAT linkage and
     *      no journal entry must stay editable.
     */
    async assertExpensePeriodUnlocked(expense: Expense): Promise<void> {
        const locked = (period: string) => {
            throw new HttpException(
                {
                    type: 'expense_period_locked',
                    message: `הדוח לתקופה ${period} כבר הוגש לרשויות המס — לא ניתן לערוך הוצאה ששויכה אליו`,
                    period,
                },
                423,
            );
        };

        if (expense.isReported === true) {
            locked((expense.vatReportingDate as string) ?? '');
        }

        const workflows = await this.reportWorkflowRepo.find({
            where: {
                businessNumber: expense.businessNumber,
                type: ReportWorkflowType.VAT_REPORT,
                status: ReportWorkflowStatus.REPORTED,
            },
        });
        if (workflows.length === 0) return;

        const business = await this.businessRepo.findOne({
            where: { businessNumber: expense.businessNumber },
        });
        const businessType = business?.businessType ?? BusinessType.LICENSED;
        const vatReportingType = business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;

        for (const wf of workflows) {
            const labels = this.sharedService.expandPeriodLabelsInRange(
                businessType,
                vatReportingType,
                new Date(wf.periodStart),
                new Date(wf.periodEnd),
            );
            if (expense.vatReportingDate) {
                if (labels.includes(expense.vatReportingDate as any)) {
                    locked(expense.vatReportingDate as string);
                }
            } else if (expense.journalEntryNumber != null) {
                const d = new Date(expense.date).getTime();
                if (d >= new Date(wf.periodStart).getTime() && d <= new Date(wf.periodEnd).getTime()) {
                    locked(labels[0] ?? '');
                }
            }
        }
    }

    /**
     * Re-apply a (category, subCategory) name classification coming from a
     * slim-transaction re-classify onto an existing Expense — keeps the FK,
     * snapshots, description, totals AND the journal entry coherent (Phase
     * 4.1; replaces syncExpenseFromSlim's raw field copies).
     *
     * D10 guards (belt-and-braces — the transaction-side lock and stickiness
     * checks should have blocked earlier):
     *   - classificationOverrideByUserId set → skip silently, the manual
     *     override is never auto re-resolved.
     *   - reported/locked period → 423.
     *   - journaled expense + unmappable target → 400.
     */
    async reclassifyExpenseFromNames(
        expense: Expense,
        input: {
            category: string;
            subCategory: string;
            vatPercent?: number;
            taxPercent?: number;
            reductionPercent?: number;
            isEquipment?: boolean;
            reportScope?: ExpenseReportScope;
            businessNumber?: string;
            vatReportingDate?: string | null;
            /** Absolute ILS amount from the source transaction — overwrites `sum` when provided. */
            sum?: number;
        },
    ): Promise<Expense> {
        if (expense.classificationOverrideByUserId != null) {
            this.logger.log(
                `reclassifyExpenseFromNames: expense ${expense.id} carries a manual classification override — skipping auto re-resolve (D10)`,
            );
            return expense;
        }
        await this.assertExpensePeriodUnlocked(expense);

        if (input.businessNumber) expense.businessNumber = input.businessNumber;
        if (input.vatReportingDate != null) expense.vatReportingDate = input.vatReportingDate as any;

        const rc = await this.resolveExpenseClassification(
            { category: input.category, subCategory: input.subCategory },
            expense.businessNumber,
            expense.userId,
        );
        if (expense.journalEntryNumber != null && !rc.journalable) {
            throw new BadRequestException(
                'לא ניתן לסווג הוצאה שנרשמה בספרים לסיווג פרטי או לסיווג ללא חשבון — יש להשלים את המיפוי החשבונאי תחילה',
            );
        }
        this.applyClassificationToExpense(
            expense,
            rc,
            {
                vatPercent: input.vatPercent,
                taxPercent: input.taxPercent,
                reductionPercent: input.reductionPercent,
                isEquipment: input.isEquipment,
                reportScope: input.reportScope,
            },
            expense.userId,
        );

        if (input.sum !== undefined) expense.sum = input.sum;
        const business = await this.businessRepo.findOne({ where: { businessNumber: expense.businessNumber } });
        this.recomputeExpenseTotals(expense, business?.businessType);

        const saved = await this.expense_repo.save(expense);
        if (rc.journalable) {
            await this.syncExpenseJournalEntry(saved);
        }
        return saved;
    }

    /**
     * Phase 4.2 (C1) — PATCH expenses/:id/reclassify. Full reclassification
     * onto a different sub_category, CARD LAW ONLY (D1: picking a card IS the
     * classification — no percent overrides here). Rewrites snapshots +
     * description + journal in one transaction and stamps the D10 override
     * (actor = the accountant's own id when impersonating).
     */
    async reclassifyExpense(
        id: number,
        userId: string,
        actorUserId: string,
        subCategoryId: number,
    ): Promise<Expense> {
        const expense = await this.expense_repo.findOne({ where: { id } });
        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this expense`);
        }
        await this.assertExpensePeriodUnlocked(expense);

        const rc = await this.resolveExpenseClassification({ subCategoryId }, expense.businessNumber, expense.userId);
        if (expense.journalEntryNumber != null && !rc.journalable) {
            throw new BadRequestException(
                'לא ניתן לסווג הוצאה שנרשמה בספרים לסיווג פרטי או לסיווג ללא חשבון — יש להשלים את המיפוי החשבונאי תחילה',
            );
        }

        return this.dataSource.transaction(async (m) => {
            this.applyClassificationToExpense(expense, rc, {}, actorUserId);
            const business = await m.getRepository(Business).findOne({
                where: { businessNumber: expense.businessNumber },
            });
            this.recomputeExpenseTotals(expense, business?.businessType);
            expense.classificationOverrideByUserId = actorUserId;
            expense.classificationOverrideAt = new Date();

            const saved = await m.getRepository(Expense).save(expense);
            if (rc.journalable) {
                await this.rewriteExpenseJournal(saved, m);
            }
            return saved;
        });
    }

    /**
     * Phase 4.2 (C2) — PATCH expenses/:id/override-mapping. Mapping-only
     * override: the sub_category (client language) stays; the accounting
     * snapshots are overwritten from an explicitly-chosen card (by id or by
     * code, exactly one). Journal lines are rewritten; D10 override stamped.
     */
    async overrideExpenseMapping(
        id: number,
        userId: string,
        actorUserId: string,
        input: { accountId?: number; accountCode?: string },
    ): Promise<Expense> {
        const hasId = input.accountId != null;
        const hasCode = !!input.accountCode?.trim();
        if (hasId === hasCode) {
            throw new BadRequestException('יש לספק בדיוק אחד מ-accountId או accountCode');
        }

        const expense = await this.expense_repo.findOne({ where: { id } });
        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this expense`);
        }
        await this.assertExpensePeriodUnlocked(expense);

        // 5.1: accountant-layer cards (the actor's own 70000-range accounts)
        // are valid override targets — the ctx carries the owner's delegations.
        const ctx = await this.catalogContextService.forUser(expense.userId, expense.businessNumber);
        const account = hasId
            ? await this.catalogService.findAccountByIdInScope(input.accountId!, ctx)
            : await this.catalogService.findAccountByCodeInScope(input.accountCode!, ctx);
        if (!account) {
            throw new NotFoundException('חשבון הרישום לא נמצא');
        }

        return this.dataSource.transaction(async (m) => {
            // subCategoryId / category / subCategory / description stay — only
            // the accounting mapping moves onto the chosen card (with its law).
            expense.accountIdSnapshot = account.id;
            expense.accountCodeSnapshot = account.code;
            expense.accountNameSnapshot = account.name;
            expense.sectionIdSnapshot = account.section?.id ?? account.sectionId ?? null;
            expense.sectionCodeSnapshot = account.section?.code ?? null;
            expense.sectionNameSnapshot = account.section?.name ?? null;
            expense.code6111Snapshot = account.code6111 ?? null;
            expense.vatPercentSnapshot = Number(account.vatPercent ?? 0);
            expense.taxPercentSnapshot = Number(account.taxPercent ?? 0);
            expense.reductionPercentSnapshot = Number(account.reductionPercent ?? 0);
            expense.isEquipmentSnapshot = !!account.isEquipment;

            // A mapping override IS the accounting completion — an unmapped
            // (MISSING) expense becomes approvable the moment a card is chosen.
            expense.approvalStatus = ExpenseApprovalStatus.APPROVED;
            expense.approvedByUserId = expense.approvedByUserId ?? actorUserId;
            expense.approvedAt = expense.approvedAt ?? new Date();
            expense.classificationOverrideByUserId = actorUserId;
            expense.classificationOverrideAt = new Date();

            const business = await m.getRepository(Business).findOne({
                where: { businessNumber: expense.businessNumber },
            });
            this.recomputeExpenseTotals(expense, business?.businessType);

            const saved = await m.getRepository(Expense).save(expense);
            await this.rewriteExpenseJournal(saved, m);
            return saved;
        });
    }

    /**
     * Phase 5.3 (D9's inline completion row) — POST expenses/:id/
     * complete-mapping. The accountant picks a card for a
     * MISSING_ACCOUNTING_MAPPING row; the "החל גם על סיווגים עתידיים"
     * checkbox decides:
     *   - applyToFuture=false → one-off snapshot override on this expense
     *     only (delegates to the 4.2 overrideExpenseMapping path).
     *   - applyToFuture=true → the expense's sub_category is repointed at
     *     the card (SYSTEM/ACCOUNTANT rows get a CLIENT override row, D4),
     *     then THIS expense is re-resolved through it — snapshots +
     *     description + journal in one transaction, approval + D10 override
     *     stamped with the actor (approved by Elazar: completion
     *     auto-approves + journals, consistent with overrideExpenseMapping).
     *     The repoint itself commits before the expense transaction; if the
     *     second step fails the mapping is still completed and the expense
     *     stays pending — a retryable state, never a corrupt one.
     */
    async completeExpenseMapping(
        id: number,
        userId: string,
        actorUserId: string,
        input: { accountId: number; applyToFuture?: boolean },
    ): Promise<Expense> {
        if (input.accountId == null) {
            throw new BadRequestException('accountId is required');
        }
        if (!input.applyToFuture) {
            return this.overrideExpenseMapping(id, userId, actorUserId, { accountId: input.accountId });
        }

        const expense = await this.expense_repo.findOne({ where: { id } });
        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this expense`);
        }
        await this.assertExpensePeriodUnlocked(expense);
        if (expense.subCategoryId == null) {
            throw new BadRequestException(
                'להוצאה אין תת-קטגוריה — השלמת מיפוי עתידית דורשת סיווג קיים; יש לסווג את ההוצאה או להשתמש בעקיפה חד-פעמית',
            );
        }

        const ctx = await this.catalogContextService.forUser(expense.userId, expense.businessNumber);
        const effectiveSub = await this.catalogService.repointSubCategoryAccount(
            expense.subCategoryId,
            input.accountId,
            ctx,
        );
        // repoint may have landed a CLIENT override row with a different id —
        // reclassify onto the EFFECTIVE row so the FK matches what future
        // name-resolution will pick (D4 precedence).
        return this.reclassifyExpense(id, userId, actorUserId, effectiveSub.id);
    }

    /** Rewrite (or create) an expense's journal entry inside the caller's
     *  transaction — the 4.2 endpoints' journal-line-replacing step. */
    private async rewriteExpenseJournal(expense: Expense, m: EntityManager): Promise<void> {
        const input = await this.buildJournalEntryInput(expense);
        if (expense.journalEntryNumber != null) {
            const updated = await this.bookkeepingService.updateJournalEntryFull(
                expense.journalEntryNumber,
                expense.businessNumber,
                input,
                m,
            );
            if (updated) return;
        }
        const { entryNumber } = await this.bookkeepingService.createJournalEntry(input, m);
        await m.getRepository(Expense).update(expense.id, { journalEntryNumber: entryNumber });
        expense.journalEntryNumber = entryNumber;
    }

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
        /** Transactional manager to JOIN — the review-modal approve paths pass
         *  their own so expense + journal + doc/slim flips commit atomically.
         *  When omitted, addExpense opens its own transaction (fixes the
         *  historical nested-transaction bug where approve* wrapped
         *  addExpense's separate inner transaction). */
        manager?: EntityManager,
        /** Source-document context for the D7 description fallback chain. */
        doc?: DescriptionDocInput | null,
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

        // ── Classification (Phase 4.1 — D1/D5/D6/D7) ─────────────────────────
        // subCategoryId wins; the legacy name pair is the fallback (until 4.6).
        // Writes FK + snapshots + description + approvalStatus in one place;
        // DTO-explicit percents/isEquipment act as one-off snapshot overrides
        // over the card's law (transition rule until Phase 6). Unresolvable
        // input → 400: the silent 60000 fallback is dead (Elazar, Session 8).
        const rc = await this.resolveExpenseClassification(
            {
                subCategoryId: expense.subCategoryId,
                category: expense.category,
                subCategory: expense.subCategory,
            },
            businessNumber,
            userId,
        );
        this.applyClassificationToExpense(
            newExpense,
            rc,
            {
                vatPercent: expense.vatPercent,
                taxPercent: expense.taxPercent,
                reductionPercent: expense.reductionPercent,
                isEquipment: typeof (expense as any).isEquipment === 'boolean' ? (expense as any).isEquipment : undefined,
            },
            userId,
            doc,
        );

        newExpense.userId = userId;
        newExpense.date = expense.date;
        newExpense.loadingDate = new Date();
        newExpense.businessNumber = businessNumber;

        // Fetch business once — used both for the VAT calculation guard and for
        // the VAT-period stamp below. Avoids a second round-trip to the DB.
        const expenseBusiness = await this.businessRepo.findOne({
            where: { businessNumber, firebaseId: userId },
        });

        // Exempt businesses (עוסק פטור / שותפות פטורה) cannot reclaim input
        // VAT — recomputeExpenseTotals forces vatPercent = 0 for them so the
        // P&L shows the correct full amount.
        this.recomputeExpenseTotals(newExpense, expenseBusiness?.businessType);

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

        // ── Atomic: save Expense + stamp VAT period + post journal + supplier ──
        // Joins the CALLER's transaction when `manager` is provided (review-
        // modal approve paths); otherwise opens its own. The journal entry is
        // posted only for journalable classifications — MISSING_ACCOUNTING_
        // MAPPING and private (D5) rows commit with journalEntryNumber = null.
        const persistExpense = async (m: EntityManager): Promise<Expense> => {
            const expRepo = m.getRepository(Expense);

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

            // Journal entry in the same transaction — any failure rolls back
            // the Expense save too.
            if (rc.journalable) {
                const input = await this.buildJournalEntryInput(saved);
                const { entryNumber } = await this.bookkeepingService.createJournalEntry(input, m);
                await expRepo.update(saved.id, { journalEntryNumber: entryNumber });
                saved.journalEntryNumber = entryNumber;
            }

            // Auto-register the supplier in this business's master list.
            // Idempotent via the (businessNumber, supplierID) find-or-create.
            // Scoped by businessNumber (NOT userId) because the suppliers list
            // endpoint is per-business. Empty supplierIDs (foreign vendors
            // with no Israeli tax ID) get skipped. saveAsSupplier=false skips
            // the whole block (review modal's red-flag dismiss).
            //
            // Moved INSIDE the transaction (Session 8 review): now that
            // addExpense can join the caller's tx, a ghost supplier surviving
            // a rolled-back approve is a real scenario. Its own failures stay
            // best-effort — log and continue (an InnoDB duplicate-key error
            // does not poison the surrounding transaction).
            const supplierIdTrimmed = newExpense.supplierID?.trim();
            if (saveAsSupplier && supplierIdTrimmed) {
                const supplierRepo = m.getRepository(Supplier);
                try {
                    const existing = await supplierRepo.findOne({
                        where: { businessNumber, supplierID: supplierIdTrimmed },
                    });
                    if (!existing) {
                        await supplierRepo.save(supplierRepo.create({
                            userId,
                            businessNumber,
                            supplier: newExpense.supplier ?? '',
                            supplierID: supplierIdTrimmed,
                            category: newExpense.category ?? '',
                            subCategory: newExpense.subCategory ?? '',
                            vatPercent: newExpense.vatPercentSnapshot ?? 0,
                            taxPercent: newExpense.taxPercentSnapshot ?? 0,
                            isEquipment: !!newExpense.isEquipmentSnapshot,
                            reductionPercent: 0,
                        }));
                    }
                } catch (err: any) {
                    // ER_DUP_ENTRY = the DB's uq_supplier_business_supplierid
                    // index caught a race (concurrent tabs / double-click) —
                    // the sibling request already created the row.
                    if (err?.code === 'ER_DUP_ENTRY') {
                        this.logger.debug(
                            `addExpense: Supplier auto-create lost a race for ` +
                            `(biz=${businessNumber}, supplierID=${supplierIdTrimmed}) — sibling won, OK`,
                        );
                    } else {
                        this.logger.warn(
                            `addExpense: auto-create Supplier failed (supplierID=${supplierIdTrimmed}, expense=${saved.id}): ${err?.message ?? err}`,
                        );
                    }
                }
            }

            return saved;
        };

        return manager ? persistExpense(manager) : this.dataSource.transaction(persistExpense);
    }

    async updateExpense(id: number, userId: string, updateExpenseDto: UpdateExpenseDto): Promise<Expense> {

        const expense = await this.expense_repo.findOne({ where: { id } });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        // Check if the user making the request is the owner of the expense
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this expense`);
        }

        const dto = updateExpenseDto as any;
        const classificationTouched =
            dto.subCategoryId !== undefined || dto.category !== undefined || dto.subCategory !== undefined;
        const journalAffecting =
            classificationTouched ||
            ['sum', 'vatPercent', 'taxPercent', 'date', 'isEquipment', 'supplier'].some((k) => dto[k] !== undefined);

        // D10: expenses in an already-REPORTED VAT period reject every
        // journal-affecting edit with 423.
        if (journalAffecting) {
            await this.assertExpensePeriodUnlocked(expense);
        }

        let journalable: boolean;
        if (classificationTouched) {
            // Full re-resolution through the catalog — snapshots, description
            // and approvalStatus move together. The old 'רכוש קבוע' special-
            // case is gone: isEquipment comes from the card (or an explicit
            // DTO override).
            const rc = await this.resolveExpenseClassification(
                {
                    subCategoryId: dto.subCategoryId,
                    category: dto.category ?? expense.category,
                    subCategory: dto.subCategory ?? expense.subCategory,
                },
                expense.businessNumber,
                expense.userId,
            );
            // A journaled expense cannot move to a target that can't be
            // journaled — there is no journal-delete API and storno is
            // explicitly out of scope (D10: just block).
            if (expense.journalEntryNumber != null && !rc.journalable) {
                throw new BadRequestException(
                    'לא ניתן לסווג הוצאה שנרשמה בספרים לסיווג פרטי או לסיווג ללא חשבון — יש להשלים את המיפוי החשבונאי תחילה',
                );
            }
            this.applyClassificationToExpense(
                expense,
                rc,
                {
                    vatPercent: dto.vatPercent,
                    taxPercent: dto.taxPercent,
                    isEquipment: typeof dto.isEquipment === 'boolean' ? dto.isEquipment : undefined,
                },
                userId,
            );
            journalable = rc.journalable;
        } else {
            if (dto.vatPercent !== undefined) expense.vatPercentSnapshot = dto.vatPercent;
            if (dto.taxPercent !== undefined) expense.taxPercentSnapshot = dto.taxPercent;
            if (typeof dto.isEquipment === 'boolean') expense.isEquipmentSnapshot = dto.isEquipment;
            // Journalability from current state: an existing entry keeps being
            // synced; otherwise only an APPROVED row with an account snapshot
            // qualifies (private/MISSING rows have no accountCodeSnapshot).
            journalable =
                expense.journalEntryNumber != null ||
                (expense.approvalStatus === ExpenseApprovalStatus.APPROVED && !!expense.accountCodeSnapshot);
        }

        if (dto.sum !== undefined) expense.sum = dto.sum;

        // Recalculate totals when any amount-affecting input changed.
        if (classificationTouched || dto.vatPercent !== undefined || dto.taxPercent !== undefined || dto.sum !== undefined) {
            const updateBusiness = await this.businessRepo.findOne({ where: { businessNumber: expense.businessNumber } });
            this.recomputeExpenseTotals(expense, updateBusiness?.businessType);
        }

        // updateExpenseDto still carries wire-format `vatPercent`/`taxPercent`/
        // `isEquipment` (snapshot columns set above) plus the new
        // `subCategoryId`/`category`/`subCategory` (owned by
        // applyClassificationToExpense). Strip them so the spread only touches
        // fields that are still name-aligned.
        const {
            vatPercent: _vp, taxPercent: _tp, isEquipment: _ie,
            subCategoryId: _sc, category: _c, subCategory: _s,
            ...restUpdateDto
        } = dto;
        const saved = await this.expense_repo.save({
            ...expense,
            ...restUpdateDto,
        });

        // Journal transitions:
        //   journalable + entry exists      → full re-sync (amounts, dates,
        //                                     supplier, account codes).
        //   journalable + no entry          → the mapping was just completed —
        //                                     syncExpenseJournalEntry's path 3
        //                                     creates the entry (paths 1/2
        //                                     still catch legacy rows whose
        //                                     entry is only findable by
        //                                     reference lookup).
        //   not journalable + entry exists  → unreachable (blocked with 400
        //                                     above before the save).
        //   not journalable + no entry      → nothing to do (MISSING/private
        //                                     rows stay out of the ledger).
        if (journalable) {
            await this.syncExpenseJournalEntry(saved);
        }

        return saved;
    }

    /**
     * Delete an expense AND its posted journal entry in one transaction
     * (Phase 4.3b). Pre-4.3b this removed only the expense row and orphaned
     * the journal entry — an active accounting bug (the ledger kept a posting
     * whose source no longer existed).
     *
     * The D10 period lock applies to deletes exactly as to edits: a reported
     * expense (or one whose period was already submitted) throws 423 before
     * anything is touched. Correction entries (סטורנו) are out of scope per
     * D10 — locked rows are simply blocked.
     *
     * Entry lookup mirrors syncExpenseJournalEntry: journalEntryNumber first,
     * then the (referenceType=EXPENSE, referenceId, businessNumber) reference
     * lookup for legacy rows — checking both id and expenseNumber, since
     * createExpenseJournalEntry historically wrote either as referenceId.
     * Unjournaled expenses (MISSING mapping / private) simply have no entry
     * to remove.
     */
    async deleteExpense(id: number, userId: string): Promise<any> {
        const expense = await this.expense_repo.findOne({ where: { id } });

        if (!expense) {
            throw new NotFoundException(`Expense with ID ${id} not found`);
        }

        // Check if the user making the request is the owner of the expense
        if (expense.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to delete this expense`);
        }

        // D10: a delete rewrites history exactly like a reclassification does.
        await this.assertExpensePeriodUnlocked(expense);

        // Resolve the journal entry BEFORE the transaction (reads only).
        let entryNumber: number | null = expense.journalEntryNumber ?? null;
        if (entryNumber == null) {
            entryNumber = await this.bookkeepingService.findJournalEntryNumber(
                JournalReferenceType.EXPENSE,
                expense.id,
                expense.businessNumber,
            );
        }
        if (entryNumber == null && Number(expense.expenseNumber) && Number(expense.expenseNumber) !== expense.id) {
            entryNumber = await this.bookkeepingService.findJournalEntryNumber(
                JournalReferenceType.EXPENSE,
                Number(expense.expenseNumber),
                expense.businessNumber,
            );
        }

        return this.dataSource.transaction(async (m) => {
            if (entryNumber != null) {
                const deleted = await this.bookkeepingService.deleteJournalEntry(
                    entryNumber,
                    expense.businessNumber,
                    m,
                );
                if (!deleted) {
                    this.logger.warn(
                        `deleteExpense: journal entry ${entryNumber} not found for expense ${expense.id} — deleting expense only`,
                    );
                }
            }
            return m.getRepository(Expense).remove(expense);
        });
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

        const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
        const scope = this.catalogService.buildScope(OwnerType.CLIENT, ctx);
        // Parent category need not exist in the CLIENT's own scope — it may be
        // a SYSTEM (or, since 5.1, an accountant's) default the client is
        // adding sub-categories under; find or create it in CLIENT scope only
        // when no visible category of that name exists.
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

        // Phase 5.3 (D5): "defer to accountant" saves the row unmapped
        // (MISSING_ACCOUNTING_MAPPING) — only meaningful when an accountant
        // actually services this client. A client without an ACTIVE
        // delegation would be stuck forever, so they must pick a mapping
        // (the D9 simple picker) instead.
        if (subCategories.some((s) => s.deferToAccountant) && !(ctx.accountantIds?.length)) {
            throw new BadRequestException(
                'לא ניתן להשאיר את המיפוי לרואה החשבון — לא מקושר רואה חשבון לחשבון זה. יש לבחור למה ההוצאה שייכת.',
            );
        }

        const created: SubCategory[] = [];
        for (const subDto of subCategories) {
            let sub: SubCategory;
            if (subDto.deferToAccountant) {
                // No law, no accountId → CatalogService lands the row as
                // MISSING_ACCOUNTING_MAPPING; the accountant completes it via
                // the D9 inline row (complete-mapping / repoint endpoints).
                sub = await this.catalogService.createSubCategory(scope, category, subDto.subCategoryName, {
                    reportScope: subDto.reportScope ?? ExpenseReportScope.PNL,
                    createdByUserId: firebaseId,
                });
            } else {
                const law: AccountLaw = {
                    vatPercent: subDto.vatPercent ?? 0,
                    taxPercent: subDto.taxPercent ?? 0,
                    reductionPercent: subDto.reductionPercent ?? 0,
                    isEquipment: subDto.isEquipment ?? false,
                    recognitionType: subDto.isRecognized === false ? RecognitionType.NOT_RECOGNIZED : RecognitionType.RECOGNIZED,
                };
                sub = await this.catalogService.createSubCategory(scope, category, subDto.subCategoryName, {
                    law,
                    reportScope: subDto.reportScope ?? ExpenseReportScope.PNL,
                    createdByUserId: firebaseId,
                });
            }
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
            const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
            const categories = await this.catalogService.getMergedCategories(ctx, type);
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

        const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
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

        const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
        const resolved = await this.catalogService.resolveByName(categoryName, subCategoryName, ctx);
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

        const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
        const resolved = await this.catalogService.resolveByName(categoryName, subCategoryName, ctx);
        return resolved?.subCategory?.reportScope ?? ExpenseReportScope.PNL;
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

        // Phase 4.1: the account code comes from the expense's own snapshot
        // (frozen at classification time, D6). Legacy rows that predate the
        // snapshot columns get ONE name-resolution retry; if that fails too,
        // throw — the 60000 fallback is dead, an unmappable expense must not
        // silently post to the catch-all card.
        let expenseAccountCode = expense.accountCodeSnapshot;
        if (!expenseAccountCode) {
            const retried = await this.catalogService.resolveByName(
                expense.category, expense.subCategory,
                await this.catalogContextService.forUser(expense.userId, expense.businessNumber),
            );
            expenseAccountCode = retried?.account?.code ?? null;
            if (!expenseAccountCode) {
                throw new BadRequestException(
                    `להוצאה ${expense.id} אין חשבון רישום (סיווג "${expense.category}/${expense.subCategory}" לא ממופה) — לא ניתן לרשום פקודת יומן`,
                );
            }
        }

        const isEquipment = expense.isEquipmentSnapshot ?? false;
        const taxPct = Number(expense.taxPercentSnapshot) || 0;
        const vatPct  = Number(expense.vatPercentSnapshot)  || 0;
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
            // D7: the expense's frozen description IS the journal entry's
            // description. Legacy rows without one get the same fallback chain.
            description: expense.description
                ?? buildExpenseDescription({ category: expense.category, subCategory: expense.subCategory }),
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

        // Phase 4.4 (D3): the old resolvedPnlCategory precedence chain
        // (per-expense override → subcategory pnlCategory map → bookkeeping
        // category) is DELETED — the pnlCategory namespace is dead. The P&L
        // grouping an expense rolls up under is its sectionNameSnapshot (D6),
        // already on every row; the frontend column reads it directly.

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
                isEquipmentSnapshot: true,
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

        const ctx = await this.catalogContextService.forUser(firebaseId, businessNumber);
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
