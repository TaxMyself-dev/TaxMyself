import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, Between, MoreThanOrEqual, LessThanOrEqual, Brackets } from 'typeorm';
import { subYears } from 'date-fns';

import { SlimTransaction } from './slim-transaction.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { UserTransactionCacheState } from './user-transaction-cache-state.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { Business } from 'src/business/business.entity';
import { Expense } from 'src/expenses/expenses.entity';
import { SharedService } from 'src/shared/shared.service';
import { BusinessType, VATReportingType } from 'src/enum';

import { NormalizedTransaction } from './interfaces/normalized-transaction.interface';
import { ProcessingResult } from './interfaces/processing-result.interface';
import { ClassifyManuallyDto } from './dtos/classify-manually.dto';
import { ClassifyWithRuleDto } from './dtos/classify-with-rule.dto';
import { ClassifyWithRuleResult } from './interfaces/classify-with-rule-result.interface';
import { FlowAnalysisResponse, MonthlyFlowPoint } from './interfaces/flow-analysis-response.interface';
import { ClassificationType } from './enums/classification-type.enum';
import { UserSyncStateService } from './user-sync-state.service';
import { UserSyncState } from './user-sync-state.entity';

/** Hours before a user's full_transactions_cache is considered stale. */
const CACHE_TTL_HOURS = 24;

interface BillInfo {
  billId: number;
  billName: string;
  businessNumber: string | null;
}

/**
 * Core pipeline for the Feezback transaction flow.
 *
 * Responsibilities:
 *  - Resolve billId from paymentIdentifier (batch, never per-transaction).
 *  - Run STEP 0–3 for each NormalizedTransaction.
 *  - Perform deterministic rule matching with specificity scoring.
 *  - Manage full_transactions_cache UPSERTs and slim_transactions INSERTs.
 *  - Manage user_transaction_cache_state lifecycle.
 *  - Implement classifyManually() with VAT lock and billId guard.
 *
 * NOTE: getBillIdByBillName / getBillNameByBillId from TransactionsService
 * are legacy transition helpers and are NOT used here.
 */
@Injectable()
export class TransactionProcessingService {
  private readonly logger = new Logger(TransactionProcessingService.name);

  constructor(
    @InjectRepository(SlimTransaction)
    private readonly slimRepo: Repository<SlimTransaction>,

    @InjectRepository(FullTransactionCache)
    private readonly cacheRepo: Repository<FullTransactionCache>,

    @InjectRepository(UserTransactionCacheState)
    private readonly cacheStateRepo: Repository<UserTransactionCacheState>,

    @InjectRepository(ClassifiedTransactions)
    private readonly rulesRepo: Repository<ClassifiedTransactions>,

    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,

    @InjectRepository(DefaultCategory)
    private readonly categoryRepo: Repository<DefaultCategory>,

    @InjectRepository(UserCategory)
    private readonly userCategoryRepo: Repository<UserCategory>,

    @InjectRepository(Bill)
    private readonly billRepo: Repository<Bill>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,

    private readonly userSyncStateService: UserSyncStateService,
    private readonly sharedService: SharedService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * slimRepo.upsert() runs TypeORM's returning-entity updater after INSERT,
   * which requires PrimaryGeneratedColumn `id` on each row — absent for these payloads.
   * Same fix as FullTransactionCache batch upserts: query builder + updateEntity(false).
   */
  private async upsertSlimTransactions(
    rows: Partial<SlimTransaction>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const updateColumns = Object.keys(rows[0] as object).filter(
      (k) => k !== 'userId' && k !== 'externalTransactionId',
    );
    await this.slimRepo
      .createQueryBuilder()
      .insert()
      .into(SlimTransaction)
      .values(rows as SlimTransaction[])
      .orUpdate(updateColumns, ['userId', 'externalTransactionId'])
      .updateEntity(false)
      .execute();
  }

  /**
   * Resolves which period label to stamp on `slim.vatReportingDate` for a
   * classification operation. Decision tree:
   *
   *   1. If the slim row already exists with a non-null `vatReportingDate`,
   *      keep it — re-classification shouldn't shuffle the period the user/
   *      system already committed to.
   *   2. Else if `explicitPeriod` is supplied (user picked from the locked-
   *      period dialog), use that.
   *   3. Else compute the natural period from the business's cadence + the
   *      transaction's date. If that period is already submitted (any sibling
   *      row in same business + period has `isLocked = true`), throw 423 with
   *      the next 3 candidate periods so the frontend can prompt.
   *
   * Returns the resolved label OR throws an HttpException 423.
   */
  private async resolveStampPeriod(
    userId: string,
    cacheRow: FullTransactionCache,
    explicitPeriod: string | null | undefined,
    /** Business number override from the classify DTO. When the user
     *  re-attributes a transaction to a different business (e.g. spouse's
     *  EXEMPT business), the period cadence must come from THAT business,
     *  not the cache row's original (pre-override) businessNumber. */
    effectiveBusinessNumber?: string | null,
  ): Promise<string | null> {
    const existing = await this.slimRepo.findOne({
      where: { userId, externalTransactionId: cacheRow.externalTransactionId },
    });
    if (existing?.vatReportingDate) return existing.vatReportingDate;
    if (explicitPeriod) return explicitPeriod;

    const businessNumber = effectiveBusinessNumber ?? cacheRow.businessNumber;
    if (!businessNumber) return null;
    const business = await this.businessRepo.findOne({
      where: { firebaseId: userId, businessNumber },
    });
    if (!business) return null;

    const businessType = business.businessType ?? BusinessType.EXEMPT;
    const vatReportingType = business.vatReportingType ?? VATReportingType.NOT_REQUIRED;
    const naturalLabel = this.sharedService.buildReportPeriodLabel(
      businessType,
      vatReportingType,
      new Date(cacheRow.transactionDate),
    );

    // Locked-sibling check uses the SAME resolved business number — when the
    // user reattributes a row from a locked-period business to a different
    // (open-period) business, we must not raise 423 against the original.
    const lockedSibling = await this.slimRepo.findOne({
      where: {
        userId,
        businessNumber,
        vatReportingDate: naturalLabel,
        isLocked: true,
      },
    });
    if (!lockedSibling) return naturalLabel;

    // Natural period is locked — surface the next 3 cadence-step labels so
    // the user can pick one. Filtering out also-locked ones is best done on
    // the frontend after the dialog opens (rare to hit two consecutive locked
    // periods), so we keep the backend response simple here.
    const next3 = this.sharedService.nextOpenPeriodLabels(
      businessType,
      vatReportingType,
      new Date(cacheRow.transactionDate),
      3,
    );
    throw new HttpException(
      {
        type: 'natural_period_locked',
        message: `הדוח לתקופה ${naturalLabel} כבר הוגש לרשויות המס. בחר תקופה אחרת לשיוך התנועה:`,
        naturalPeriod: naturalLabel,
        availablePeriods: next3,
      },
      423,
    );
  }


  /**
   * After re-classifying a confirmed (V-stamped) transaction, propagate the
   * fresh classification into the Expense row so reports stay correct.
   * No-op when no Expense exists for this externalTransactionId — e.g. the
   * transaction hasn't been confirmed yet, or the Expense was created from
   * a different source (manual entry).
   */
  private async syncExpenseFromSlim(
    userId: string,
    cacheRow: FullTransactionCache,
    slim: Pick<
      SlimTransaction,
      'category' | 'subCategory' | 'vatPercent' | 'taxPercent' | 'reductionPercent' | 'isEquipment' | 'isRecognized' | 'businessNumber' | 'vatReportingDate'
    >,
  ): Promise<void> {
    const expense = await this.expenseRepo.findOne({
      where: { userId, externalTransactionId: cacheRow.externalTransactionId },
    });
    if (!expense) return;

    const absSum = Math.abs(Number(cacheRow.amount));
    const vatRate = this.sharedService.getVatRateByYear(new Date(cacheRow.transactionDate));
    const totalVatPayable = (absSum / (1 + vatRate)) * vatRate * (slim.vatPercent / 100);
    const totalTaxPayable = (absSum - totalVatPayable) * (slim.taxPercent / 100);

    expense.category = slim.category;
    expense.subCategory = slim.subCategory;
    expense.vatPercent = slim.vatPercent;
    expense.taxPercent = slim.taxPercent;
    expense.reductionPercent = slim.reductionPercent;
    expense.isEquipment = slim.isEquipment;
    expense.businessNumber = slim.businessNumber ?? expense.businessNumber;
    expense.vatReportingDate = (slim.vatReportingDate as any) ?? expense.vatReportingDate;
    expense.totalVatPayable = totalVatPayable;
    expense.totalTaxPayable = totalTaxPayable;
    await this.expenseRepo.save(expense);
  }


  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Main entry point.
   *
   * Processes a batch of NormalizedTransactions for a user, applying STEP 0–3:
   *   STEP 0 – no billId → full_transactions_cache only (no classification).
   *   STEP 1 – slim row exists → overlay classification onto cache row.
   *            If classificationType = ONE_TIME, rule matching is SKIPPED.
   *   STEP 2 – no slim → attempt rule matching → create slim + update cache.
   *   STEP 3 – no rule match → cache only.
   *
   * Cache UPSERTs are batched. Slim INSERTs are batch-inserted with
   * INSERT IGNORE semantics (race-safe).
   */
  async process(
    userId: string,
    transactions: NormalizedTransaction[],
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      totalReceived: transactions.length,
      savedToSlim: 0,
      savedToCacheOnly: 0,
      ruleMatched: 0,
      skippedNoBillId: 0,
      newlySavedToCache: 0,
      alreadyExistingInCache: 0,
      deduplicatedCount: 0,
    };


    if (transactions.length === 0) {
      return result;
    }

    // Batch: paymentIdentifier → BillInfo (one query for all bills/sources).
    const billMap = await this.buildBillMap(userId);

    // Enrich: resolve billId/billName from paymentIdentifier where not already set.
    const enriched: NormalizedTransaction[] = transactions.map((tx) => {
      const resolved = tx.paymentIdentifier
        ? (billMap.get(tx.paymentIdentifier) ?? null)
        : null;
      return {
        ...tx,
        billId: tx.billId ?? resolved?.billId ?? null,
        billName: tx.billName ?? resolved?.billName ?? null,
        businessNumber: tx.businessNumber ?? resolved?.businessNumber ?? null,
      };
    });

    // Batch: load existing slim rows for this batch.
    const externalIds = enriched.map((tx) => tx.externalTransactionId);
    const slimMap = await this.loadSlimMap(userId, externalIds);

    // Batch: load rules only for bills present in this batch (avoids loading
    // every rule the user has ever created).
    const billIds = [
      ...new Set(
        enriched
          .map((tx) => tx.billId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const userRules =
      billIds.length > 0
        ? await this.rulesRepo.find({ where: { userId, billId: In(billIds) } })
        : [];

    const cacheUpserts: Partial<FullTransactionCache>[] = [];
    const slimInserts: Partial<SlimTransaction>[] = [];

    for (const tx of enriched) {
      // STEP 0 – no billId → cache only, classification blocked.
      if (tx.billId === null) {
        result.skippedNoBillId++;
        cacheUpserts.push(this.buildCacheRow(userId, tx));
        result.savedToCacheOnly++;
        continue;
      }

      const slim = slimMap.get(tx.externalTransactionId);

      // STEP 1 – slim exists → overlay and skip rule matching.
      if (slim) {
        cacheUpserts.push(this.buildCacheRowWithSlim(userId, tx, slim));
        continue;
      }

      // STEP 2 – no slim → deterministic rule matching.
      const matchedRule = this.matchRule(tx, userRules);
      if (matchedRule) {
        slimInserts.push({
          userId,
          externalTransactionId: tx.externalTransactionId,
          billId: tx.billId,
          classificationType: ClassificationType.RULE,
          classificationRuleId: matchedRule.id,
          category: matchedRule.category,
          subCategory: matchedRule.subCategory,
          vatPercent: matchedRule.vatPercent,
          taxPercent: matchedRule.taxPercent,
          reductionPercent: matchedRule.reductionPercent,
          isEquipment: matchedRule.isEquipment,
          isRecognized: matchedRule.isRecognized,
          confirmed: false,
          vatReportingDate: null,
          businessNumber: matchedRule.businessNumber ?? null,
        });
        result.savedToSlim++;
        result.ruleMatched++;
        cacheUpserts.push(this.buildCacheRowWithRule(userId, tx, matchedRule));
        continue;
      }

      // STEP 3 – no rule match → cache only.
      cacheUpserts.push(this.buildCacheRow(userId, tx));
      result.savedToCacheOnly++;
    }

    // Detect and log duplicate externalTransactionIds in this batch.
    const idCount = new Map<string, number>();
    for (const tx of enriched) {
      if (tx.externalTransactionId) {
        idCount.set(tx.externalTransactionId, (idCount.get(tx.externalTransactionId) ?? 0) + 1);
      }
    }
    const duplicates = enriched.filter(tx => (idCount.get(tx.externalTransactionId) ?? 0) > 1);
    if (duplicates.length > 0) {
      console.log(`  ⚠️  Duplicate transactions (${duplicates.length}):`);
      for (const tx of duplicates) {
        const date = tx.transactionDate instanceof Date ? tx.transactionDate.toISOString().slice(0, 10) : '—';
        console.log(`    id=${tx.externalTransactionId}  date=${date}  amount=${tx.amount}`);
      }
    }

    // Persist slim rows: INSERT IGNORE (do not overwrite existing ONE_TIME rows
    // in case of a race condition or double-processing).
    if (slimInserts.length > 0) {
      await this.slimRepo
        .createQueryBuilder()
        .insert()
        .into(SlimTransaction)
        .values(slimInserts as SlimTransaction[])
        .orIgnore()
        .execute();
    }

    // Count existing cache rows before upsert to distinguish inserts from updates.
    if (cacheUpserts.length > 0) {
      const upsertExternalIds = [
        ...new Set(
          cacheUpserts
            .map((r) => r.externalTransactionId)
            .filter((id): id is string => !!id),
        ),
      ];

      const existingCacheRows = upsertExternalIds.length > 0
        ? await this.cacheRepo
            .createQueryBuilder('c')
            .select('c.externalTransactionId')
            .where('c.userId = :userId', { userId })
            .andWhere('c.externalTransactionId IN (:...ids)', { ids: upsertExternalIds })
            .getCount()
        : 0;

      result.deduplicatedCount = cacheUpserts.length - upsertExternalIds.length;
      result.alreadyExistingInCache = existingCacheRows;
      result.newlySavedToCache = upsertExternalIds.length - existingCacheRows;


      // UPSERT full_transactions_cache: refresh provider data and overlay on
      // conflict (userId, externalTransactionId).
      //
      // NOTE: cacheRepo.upsert() is NOT used here because FullTransactionCache has
      // several columns with `default:` values (e.g. isRecognized, vatPercent).
      // TypeORM includes those in getInsertionReturningColumns(), then tries to
      // SELECT them back after the MySQL INSERT — but needs entity.id to do so,
      // which is absent in a Partial<> upsert payload.  Using the query builder
      // with .updateEntity(false) skips that re-select entirely.
      const upsertUpdateColumns = Object.keys(cacheUpserts[0]).filter(
        (k) => k !== 'userId' && k !== 'externalTransactionId',
      );
      await this.cacheRepo
        .createQueryBuilder()
        .insert()
        .into(FullTransactionCache)
        .values(cacheUpserts as FullTransactionCache[])
        .orUpdate(upsertUpdateColumns, ['userId', 'externalTransactionId'])
        .updateEntity(false)
        .execute();
    }

    await this.updateCacheState(userId);

    return result;
  }

  /**
   * Manually classifies a transaction (ONE_TIME).
   *
   * Guards:
   *  - Transaction must exist in full_transactions_cache.
   *  - Cache row must have a billId (no billId → classification blocked).
   *  - If slim row exists with isLocked = true → blocked (report submitted).
   *
   * ONE_TIME classifications can be updated manually again as long as the
   * report has not been submitted (isLocked = false). Rules will never
   * override a ONE_TIME slim row (STEP 1 short-circuits rule matching when
   * a slim row exists).
   */
  async classifyManually(
    userId: string,
    dto: ClassifyManuallyDto,
  ): Promise<void> {
    // 1. Locate in cache.
    const cacheRow = await this.cacheRepo.findOne({
      where: { userId, externalTransactionId: dto.externalTransactionId },
    });
    if (!cacheRow) {
      throw new NotFoundException(
        `Transaction "${dto.externalTransactionId}" not found in cache.`,
      );
    }

    // 2. billId guard – no classification without billId.
    if (cacheRow.billId === null) {
      throw new BadRequestException(
        `Transaction "${dto.externalTransactionId}" has no billId and cannot be classified.`,
      );
    }

    // 3. Load slim to check VAT lock.
    const slim = await this.slimRepo.findOne({
      where: { userId, externalTransactionId: dto.externalTransactionId },
    });
    if (slim?.isLocked) {
      // Typed 423 (Locked) — frontend distinguishes this from generic 400s and
      // surfaces a dedicated "report submitted" info dialog instead of a toast.
      throw new HttpException(
        {
          type: 'blocked_report_submitted',
          message: 'התנועה שייכת לדוח שכבר דווח לרשויות המס ולא ניתן לשנות את הסיווג שלה.',
        },
        423, // HTTP 423 Locked — NestJS HttpStatus enum doesn't include this constant.
      );
    }

    // 3b. Resolve the report period to stamp. May throw 423 if the
    //     natural period is locked and the caller didn't pre-select one.
    //     Use the EFFECTIVE business number (override if supplied) so the
    //     cadence + locked-sibling check come from the destination business.
    const businessNumberFinal = dto.businessNumber ?? slim?.businessNumber ?? cacheRow.businessNumber ?? null;
    const periodLabel = await this.resolveStampPeriod(
      userId,
      cacheRow,
      dto.targetPeriodLabel,
      businessNumberFinal,
    );

    // 4. Upsert slim with ONE_TIME.
    await this.upsertSlimTransactions([
      {
        userId,
        externalTransactionId: dto.externalTransactionId,
        billId: cacheRow.billId,
        classificationType: ClassificationType.ONE_TIME,
        classificationRuleId: null,
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        confirmed: slim?.confirmed ?? false,
        vatReportingDate: periodLabel,
        businessNumber: businessNumberFinal,
      },
    ]);

    // 5. Update cache overlay.
    await this.cacheRepo.update(
      { userId, externalTransactionId: dto.externalTransactionId },
      {
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        classificationType: ClassificationType.ONE_TIME,
        vatReportingDate: periodLabel,
        // Only override the bill's default attribution when the caller
        // explicitly sent a businessNumber. Undefined leaves the column alone.
        ...(dto.businessNumber !== undefined && { businessNumber: dto.businessNumber }),
      },
    );

    // 6. If this transaction was previously confirmed, mirror the new
    //    classification onto its Expense row so reports stay in sync.
    if (slim?.confirmed) {
      await this.syncExpenseFromSlim(userId, cacheRow, {
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        businessNumber: businessNumberFinal,
        vatReportingDate: periodLabel,
      });
    }
  }

  /**
   * Rule-based classification (isSingleUpdate = false).
   *
   * Guard order (checked BEFORE any write):
   *
   *  1. billId must not be null.
   *
   *  2. isLocked = true → HARD STOP.
   *     Nothing is written. Returns status = 'blocked_vat_reported'.
   *
   *  3. classificationType = ONE_TIME (without confirmOverride) →
   *     Nothing is written. Returns status = 'confirm_override'.
   *     The frontend must re-send the request with confirmOverride = true
   *     after the user explicitly agrees.
   *
   * When no blocker exists (or ONE_TIME override is confirmed):
   *  - Create or update a rule in classified_transactions.
   *  - Upsert slim row with classificationType = RULE, classificationRuleId.
   *  - Update cache overlay for the classified transaction.
   *  - Backfill: apply the rule to all existing matching cache rows within
   *    the effective date range, skipping ONE_TIME and VAT-reported rows.
   *    Lower bound: dto.startDate if the client sent one; otherwise one calendar year
   *    before the classified transaction’s date (see getEffectiveBackfillStartDate).
   *    Upper bound: dto.endDate (absent = no upper bound).
   *  - Returns status = 'applied' with backfillCount.
   */
  async classifyWithRule(
    userId: string,
    dto: ClassifyWithRuleDto,
  ): Promise<ClassifyWithRuleResult> {
    // 1. Locate in cache.
    const cacheRow = await this.cacheRepo.findOne({
      where: { userId, externalTransactionId: dto.externalTransactionId },
    });
    if (!cacheRow) {
      throw new NotFoundException(
        `Transaction "${dto.externalTransactionId}" not found in cache.`,
      );
    }

    // 2. billId guard.
    if (cacheRow.billId === null) {
      throw new BadRequestException(
        `Transaction "${dto.externalTransactionId}" has no billId and cannot be classified.`,
      );
    }

    // 3. Load existing slim to check guards.
    const slim = await this.slimRepo.findOne({
      where: { userId, externalTransactionId: dto.externalTransactionId },
    });

    // Guard: report has been submitted → absolute stop. No writes at all.
    if (slim?.isLocked) {
      return {
        status: 'blocked_vat_reported',
        message:
          'Transaction belongs to a submitted report and cannot be changed.',
      };
    }

    // Guard: ONE_TIME → require explicit confirmation before override.
    if (
      slim?.classificationType === ClassificationType.ONE_TIME &&
      !dto.confirmOverride
    ) {
      return {
        status: 'confirm_override',
        message:
          'This transaction was previously classified as one-time. ' +
          'Resend with confirmOverride = true to replace it with a rule.',
      };
    }

    // 4. Create or update rule.
    //    Rule identity: full constraint signature (same logic as legacy flow).
    //    הערה: startDate/endDate נשמרים רק אם המשתמש שלח אותם. ברירת המחדל ל־backfill
    //    (שנה אחורה מתאריך התנועה) לא נכתבת לכאן — כדי שלא ייווצר חתך תחתון ב־matchRule
    //    על תנועות שייובאו מאוחר יותר עם תאריך ישן.
    const constraintWhere: Record<string, any> = {
      userId,
      billId: cacheRow.billId,
      transactionName: cacheRow.merchantName,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      minAbsSum: dto.minAbsSum ?? null,
      maxAbsSum: dto.maxAbsSum ?? null,
      commentPattern: dto.commentPattern ?? null,
      commentMatchType: dto.commentMatchType ?? 'equals',
    };

    let rule = await this.rulesRepo.findOne({ where: constraintWhere });

    // Guard: existing rule with same signature → require explicit confirmation before override.
    if (rule && !dto.confirmOverride) {
      return {
        status: 'confirm_rule_override' as const,
        message: 'קיים כלל סיווג למוסד זה. האם ברצונך לדרוס אותו?',
      };
    }

    const classificationFields = {
      category: dto.category,
      subCategory: dto.subCategory,
      vatPercent: dto.vatPercent,
      taxPercent: dto.taxPercent,
      reductionPercent: dto.reductionPercent,
      isEquipment: dto.isEquipment,
      isRecognized: dto.isRecognized,
      isExpense: dto.isExpense ?? false,
      businessNumber: dto.businessNumber ?? null,
    };

    if (rule) {
      Object.assign(rule, classificationFields);
    } else {
      rule = this.rulesRepo.create({
        ...constraintWhere,
        ...classificationFields,
      });
    }

    const savedRule = await this.rulesRepo.save(rule);

    // 4b. Resolve the period for the FOCUS transaction. May throw 423.
    //     Use the EFFECTIVE business number so the cadence comes from the
    //     destination business when the user reattributes.
    const focusBusinessNumber = dto.businessNumber ?? slim?.businessNumber ?? cacheRow.businessNumber ?? null;
    const focusPeriodLabel = await this.resolveStampPeriod(
      userId,
      cacheRow,
      dto.targetPeriodLabel,
      focusBusinessNumber,
    );

    // 5. Upsert slim row with RULE classification.
    await this.upsertSlimTransactions([
      {
        userId,
        externalTransactionId: dto.externalTransactionId,
        billId: cacheRow.billId,
        classificationType: ClassificationType.RULE,
        classificationRuleId: savedRule.id,
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        confirmed: slim?.confirmed ?? false,
        vatReportingDate: focusPeriodLabel,
        businessNumber: focusBusinessNumber,
      },
    ]);

    // 6. Update cache overlay for the classified transaction.
    await this.cacheRepo.update(
      { userId, externalTransactionId: dto.externalTransactionId },
      {
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        classificationType: ClassificationType.RULE,
        vatReportingDate: focusPeriodLabel,
        // Only override the bill's default attribution when the caller
        // explicitly sent a businessNumber. Undefined leaves the column alone.
        ...(dto.businessNumber !== undefined && { businessNumber: dto.businessNumber }),
      },
    );

    // 6b. If the focus transaction was already confirmed, sync its Expense
    //     row so reports stay correct after re-classification.
    if (slim?.confirmed) {
      await this.syncExpenseFromSlim(userId, cacheRow, {
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        businessNumber: focusBusinessNumber,
        vatReportingDate: focusPeriodLabel,
      });
    }

    // 7. Backfill: apply rule to all other existing matching transactions.
    const backfillCount = await this.applyRuleToExistingTransactions(
      userId,
      cacheRow,
      savedRule,
      dto,
    );

    return {
      status: 'applied',
      ruleId: savedRule.id,
      backfillCount,
      message: `Rule created and classification applied. ${backfillCount} existing transaction(s) updated.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Read queries (classification domain)
  // ---------------------------------------------------------------------------

  /**
   * Returns cache rows that have NO matching slim_transactions row.
   * These are the unclassified transactions the user needs to classify.
   *
   * Uses LEFT JOIN ... IS NULL (not NOT IN) for SQL safety.
   *
   * Returns the rows mapped to the legacy Transactions response shape so the
   * frontend can consume them without changes.
   */
  async getTransactionsToClassify(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    businessNumber?: string,
  ): Promise<any[]> {
    const qb = this.cacheRepo
      .createQueryBuilder('c')
      .leftJoin(
        SlimTransaction,
        's',
        's.userId = c.userId AND s.externalTransactionId = c.externalTransactionId',
      )
      .where('c.userId = :userId', { userId })
      .andWhere('s.id IS NULL');

    if (startDate && endDate) {
      qb.andWhere('c.transactionDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      qb.andWhere('c.transactionDate >= :startDate', { startDate });
    } else if (endDate) {
      qb.andWhere('c.transactionDate <= :endDate', { endDate });
    }

    if (businessNumber) {
      qb.andWhere('c.businessNumber = :businessNumber', { businessNumber });
    }

    qb.orderBy('c.transactionDate', 'DESC');

    const rows = await qb.getMany();

    return rows.map((r) => this.mapCacheToLegacyShape(r));
  }

  /**
   * Finds a single cache row by its PK id (the numeric id the frontend sends).
   * Returns null if not found or not owned by the user.
   */
  async findCacheRowById(
    id: number,
    userId: string,
  ): Promise<FullTransactionCache | null> {
    return this.cacheRepo.findOne({ where: { id, userId } });
  }

  /**
   * Finds a single cache row by externalTransactionId (= finsiteId).
   * This is the stable lookup used by classification endpoints, since the
   * frontend row may carry either a legacy Transactions.id or a cache id,
   * but finsiteId / externalTransactionId is consistent across both.
   */
  async findCacheRowByExternalId(
    externalTransactionId: string,
    userId: string,
  ): Promise<FullTransactionCache | null> {
    return this.cacheRepo.findOne({ where: { externalTransactionId, userId } });
  }

  // ---------------------------------------------------------------------------
  // Transactions page read paths (replaces legacy `transactions` table reads)
  // ---------------------------------------------------------------------------

  /**
   * Returns income rows (amount > 0) from full_transactions_cache, mapped to
   * the legacy Transactions response shape so the frontend needs no changes.
   *
   * Filters:
   *   - userId (always scoped)
   *   - date range → transactionDate
   *   - billIds  → billId (numeric) | 'notBelong' → billId IS NULL
   *   - sources  → paymentIdentifier
   *   - categories → category (null rows always included)
   */
  async getIncomesFromCache(
    userId: string,
    startDate: Date,
    endDate: Date,
    billIds: string[] | null,
    categories: string[] | null,
    sources: string[] | null,
  ): Promise<Record<string, unknown>[]> {
    return this.getPageTransactions(
      userId, startDate, endDate, billIds, categories, sources, 'positive',
    );
  }

  /**
   * Returns expense rows (amount < 0) from full_transactions_cache, mapped to
   * the legacy Transactions response shape so the frontend needs no changes.
   */
  async getExpensesFromCache(
    userId: string,
    startDate: Date,
    endDate: Date,
    billIds: string[] | null,
    categories: string[] | null,
    sources: string[] | null,
  ): Promise<Record<string, unknown>[]> {
    return this.getPageTransactions(
      userId, startDate, endDate, billIds, categories, sources, 'negative',
    );
  }

  /**
   * Core read query for the Transactions page.
   *
   * Bill filter logic:
   *   billIds = null        → no bill filter (all rows for user)
   *   billIds = ['notBelong'] → only unlinked rows (billId IS NULL)
   *   billIds = ['1','2']   → rows where billId IN (1, 2)
   *   'notBelong' can be combined with numeric ids.
   *
   * NOT IN is never used; unlinked rows are matched with IS NULL.
   */
  private async getPageTransactions(
    userId: string,
    startDate: Date,
    endDate: Date,
    billIds: string[] | null,
    categories: string[] | null,
    sources: string[] | null,
    amountSign: 'positive' | 'negative',
  ): Promise<Record<string, unknown>[]> {
    const qb = this.cacheRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('DATE(c.transactionDate) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere(amountSign === 'positive' ? 'c.amount > 0' : 'c.amount < 0');

    // Bill filter
    if (billIds !== null) {
      const numericBillIds = billIds
        .filter((id) => id !== 'notBelong')
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));
      const includeUnlinked = billIds.includes('notBelong');

      if (numericBillIds.length === 0 && !includeUnlinked) {
        // Nothing can possibly match — skip the DB round-trip.
        return [];
      }

      if (numericBillIds.length > 0 && includeUnlinked) {
        qb.andWhere(
          new Brackets((qb2) => {
            qb2
              .where('c.billId IN (:...numericBillIds)', { numericBillIds })
              .orWhere('c.billId IS NULL');
          }),
        );
      } else if (numericBillIds.length > 0) {
        qb.andWhere('c.billId IN (:...numericBillIds)', { numericBillIds });
      } else {
        // includeUnlinked only
        qb.andWhere('c.billId IS NULL');
      }
    }

    // Sources filter — paymentIdentifier exact match list.
    if (sources && sources.length > 0) {
      qb.andWhere('c.paymentIdentifier IN (:...sources)', { sources });
    }

    // Category filter — always include NULL category (unclassified) rows.
    if (categories && categories.length > 0) {
      qb.andWhere(
        new Brackets((qb2) => {
          qb2
            .where('c.category IN (:...categories)', { categories })
            .orWhere('c.category IS NULL');
        }),
      );
    }

    qb.orderBy('c.transactionDate', 'DESC');

    const rows = await qb.getMany();
    return rows.map((r) => this.mapCacheToLegacyShape(r));
  }

  // ---------------------------------------------------------------------------
  // Cache lifecycle
  // ---------------------------------------------------------------------------

  /** Returns true if the user has at least one row in full_transactions_cache. */
  async hasTransactionCache(userId: string): Promise<boolean> {
    const row = await this.cacheRepo.findOne({ where: { userId }, select: ['id'] });
    return row !== null;
  }

  /** Returns true if this user's cache exists and has not expired. */
  async isCacheValid(userId: string): Promise<boolean> {
    const state = await this.cacheStateRepo.findOne({ where: { userId } });
    if (!state) return false;
    return new Date() < new Date(state.expiresAt);
  }

  /**
   * Deletes the user's full_transactions_cache rows and their cache state row.
   * Call before rebuilding the cache (e.g. after expiry).
   */
  async invalidateCache(userId: string): Promise<void> {
    await this.cacheRepo.delete({ userId });
    await this.cacheStateRepo.delete({ userId });
  }

  /**
   * Admin: clears a user's transaction cache and resets sync state to empty.
   * The next login will trigger a fresh Feezback sync for this user.
   */
  async clearUserCache(userId: string): Promise<void> {
    await this.cacheRepo.delete({ userId });
    await this.cacheStateRepo.delete({ userId });
    await this.userSyncStateService.markSyncEmpty(userId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a paymentIdentifier → BillInfo map for the user.
   * One DB round-trip; used to resolve billId without per-transaction queries.
   */
  private async buildBillMap(userId: string): Promise<Map<string, BillInfo>> {
    const sources = await this.sourceRepo.find({
      where: { userId },
      relations: ['bill'],
    });

    const map = new Map<string, BillInfo>();
    for (const source of sources) {
      if (source.bill) {
        map.set(source.sourceName, {
          billId: source.bill.id,
          billName: source.bill.billName,
          businessNumber: source.bill.businessNumber ?? null,
        });
      }
    }
    return map;
  }

  /**
   * Loads existing slim rows for the given externalTransactionIds.
   * Keyed by externalTransactionId for O(1) lookup.
   */
  private async loadSlimMap(
    userId: string,
    externalIds: string[],
  ): Promise<Map<string, SlimTransaction>> {
    if (externalIds.length === 0) return new Map();

    const rows = await this.slimRepo.find({
      where: { userId, externalTransactionId: In(externalIds) },
    });
    return new Map(rows.map((r) => [r.externalTransactionId, r]));
  }

  /**
   * תחתית טווח ה־backfill כשמסווגים בכלל בלי לבחור תאריך התחלה בצד הלקוח.
   * משתמשים בתאריך התנועה פחות שנה קלנדרית אחת, כדי לכלול תנועות היסטוריות
   * אחורה בלי לחסום התאמות עתידיות בכלל (שדה startDate ב־DB נשאר null).
   */
  private getEffectiveBackfillStartDate(
    dto: ClassifyWithRuleDto,
    cacheRow: FullTransactionCache,
  ): Date {
    if (dto.startDate) {
      return new Date(dto.startDate);
    }
    return subYears(new Date(cacheRow.transactionDate), 1);
  }

  /**
   * Backfills a freshly saved RULE classification to all existing matching
   * cache rows for the same user.
   *
   * Effective date range:
   *   lower bound = dto.startDate if provided; otherwise
   *                 getEffectiveBackfillStartDate() (one calendar year before
   *                 the classified transaction’s date).
   *   upper bound = dto.endDate    (no upper bound when absent)
   *
   * Skips rows where the slim row has:
   *   - classificationType = ONE_TIME
   *   - isLocked          = true
   *
   * Also post-filters by the rule's optional constraints (commentPattern,
   * minAbsSum, maxAbsSum) so that only genuinely matching rows are updated.
   *
   * Returns the count of rows updated.
   */
  private async applyRuleToExistingTransactions(
    userId: string,
    cacheRow: FullTransactionCache,
    savedRule: ClassifiedTransactions,
    dto: ClassifyWithRuleDto,
  ): Promise<number> {
    // טווח תאריכים ל־SQL: transactionDate >= effectiveStart (וגם <= endDate אם הוגדר).
    const effectiveStart = this.getEffectiveBackfillStartDate(dto, cacheRow);

    // 1. Candidate cache rows: same merchant + bill, within date range,
    //    excluding the transaction that was just classified.
    const qb = this.cacheRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.merchantName = :merchantName', {
        merchantName: cacheRow.merchantName,
      })
      .andWhere('c.billId = :billId', { billId: cacheRow.billId })
      .andWhere('c.externalTransactionId != :currentId', {
        currentId: dto.externalTransactionId,
      })
      .andWhere('c.transactionDate >= :startDate', {
        startDate: effectiveStart,
      });

    if (dto.endDate) {
      qb.andWhere('c.transactionDate <= :endDate', {
        endDate: new Date(dto.endDate),
      });
    }

    const candidates = await qb.getMany();
    if (candidates.length === 0) return 0;

    // 2. Post-filter by the rule's optional constraints.
    const filtered = candidates.filter((row) => {
      const absAmount = Math.abs(Number(row.amount));
      if (savedRule.minAbsSum != null && absAmount < savedRule.minAbsSum) return false;
      if (savedRule.maxAbsSum != null && absAmount > savedRule.maxAbsSum) return false;

      if (savedRule.commentPattern != null) {
        const note = row.note ?? '';
        if (savedRule.commentMatchType === 'equals') {
          if (note !== savedRule.commentPattern) return false;
        } else {
          if (!note.includes(savedRule.commentPattern)) return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) return 0;

    // 3. Load slim rows in one query.
    const externalIds = filtered.map((r) => r.externalTransactionId);
    const slimRows = await this.slimRepo.find({
      where: { userId, externalTransactionId: In(externalIds) },
    });
    const slimByExternalId = new Map(
      slimRows.map((s) => [s.externalTransactionId, s]),
    );

    // 4. Exclude protected rows (ONE_TIME or report already submitted).
    const eligible = filtered.filter((row) => {
      const slim = slimByExternalId.get(row.externalTransactionId);
      if (!slim) return true;
      if (slim.classificationType === ClassificationType.ONE_TIME) return false;
      if (slim.isLocked) return false;
      return true;
    });

    if (eligible.length === 0) return 0;

    // 5. Upsert slim rows.
    const classificationPayload = {
      category: dto.category,
      subCategory: dto.subCategory,
      vatPercent: dto.vatPercent,
      taxPercent: dto.taxPercent,
      reductionPercent: dto.reductionPercent,
      isEquipment: dto.isEquipment,
      isRecognized: dto.isRecognized,
    };

    // Resolve each backfilled row's report period. Stamp the existing one
    // (re-classification preserves it), then the row's natural period — if
    // that period is already locked for the row's effective business, skip
    // the row so we don't quietly file it under a submitted report. Late
    // arrivals into a locked period need explicit user attention via the
    // single-tx classify flow's natural_period_locked dialog.
    // "Effective business" = rule-level override if set, else the row's own.
    const businessNumbersForLookup = eligible
      .map((r) => savedRule.businessNumber ?? r.businessNumber)
      .filter((bn): bn is string => bn != null);
    const businessByNumber = await this.loadBusinessMap(userId, businessNumbersForLookup);
    const lockedNaturalPeriodsByBusiness = await this.loadLockedPeriodsByBusiness(
      userId,
      Array.from(businessByNumber.keys()),
    );

    const periodLabelByRow = new Map<string, string | null>();
    const rowsSkippedDueToLockedPeriod: string[] = [];
    for (const row of eligible) {
      const existingSlim = slimByExternalId.get(row.externalTransactionId);
      if (existingSlim?.vatReportingDate) {
        periodLabelByRow.set(row.externalTransactionId, existingSlim.vatReportingDate);
        continue;
      }
      const effectiveBn = savedRule.businessNumber ?? row.businessNumber;
      if (!effectiveBn) {
        periodLabelByRow.set(row.externalTransactionId, null);
        continue;
      }
      const business = businessByNumber.get(effectiveBn);
      if (!business) {
        periodLabelByRow.set(row.externalTransactionId, null);
        continue;
      }
      const naturalLabel = this.sharedService.buildReportPeriodLabel(
        business.businessType ?? BusinessType.EXEMPT,
        business.vatReportingType ?? VATReportingType.NOT_REQUIRED,
        new Date(row.transactionDate),
      );
      const lockedSet = lockedNaturalPeriodsByBusiness.get(effectiveBn);
      if (lockedSet?.has(naturalLabel)) {
        rowsSkippedDueToLockedPeriod.push(row.externalTransactionId);
        continue;
      }
      periodLabelByRow.set(row.externalTransactionId, naturalLabel);
    }

    const writable = eligible.filter(
      (r) => !rowsSkippedDueToLockedPeriod.includes(r.externalTransactionId),
    );
    if (writable.length === 0) return 0;

    const slimUpserts: Partial<SlimTransaction>[] = writable.map((row) => {
      const existingSlim = slimByExternalId.get(row.externalTransactionId);
      return {
        userId,
        externalTransactionId: row.externalTransactionId,
        billId: row.billId!,
        classificationType: ClassificationType.RULE,
        classificationRuleId: savedRule.id,
        ...classificationPayload,
        confirmed: existingSlim?.confirmed ?? false,
        vatReportingDate: periodLabelByRow.get(row.externalTransactionId) ?? null,
        // Rule-level businessNumber wins; otherwise preserve whatever the slim
        // row already had (which itself may be the bill default or a prior override).
        businessNumber: savedRule.businessNumber ?? existingSlim?.businessNumber ?? null,
      };
    });

    await this.upsertSlimTransactions(slimUpserts);

    // 6. Bulk-update cache overlay — group by period label to keep the
    //    update count small.
    const periodLabelToIds = new Map<string | null, string[]>();
    for (const row of writable) {
      const label = periodLabelByRow.get(row.externalTransactionId) ?? null;
      if (!periodLabelToIds.has(label)) periodLabelToIds.set(label, []);
      periodLabelToIds.get(label)!.push(row.externalTransactionId);
    }
    for (const [label, ids] of periodLabelToIds.entries()) {
      await this.cacheRepo
        .createQueryBuilder()
        .update(FullTransactionCache)
        .set({
          ...classificationPayload,
          classificationType: ClassificationType.RULE,
          vatReportingDate: label,
          // Only override the bill's default attribution when the rule carries
          // an explicit businessNumber. When null, leave each row's column alone.
          ...(savedRule.businessNumber !== null && { businessNumber: savedRule.businessNumber }),
        })
        .where('userId = :userId', { userId })
        .andWhere('externalTransactionId IN (:...ids)', { ids })
        .execute();
    }

    // 7. Sync Expense rows for any of the backfilled transactions that were
    //    already confirmed. Skipped (locked-natural-period) rows are not
    //    touched — their classifications stay as-is.
    const confirmedConfirmedIds = writable
      .map((r) => r.externalTransactionId)
      .filter((id) => slimByExternalId.get(id)?.confirmed);
    for (const id of confirmedConfirmedIds) {
      const row = writable.find((r) => r.externalTransactionId === id)!;
      await this.syncExpenseFromSlim(userId, row, {
        ...classificationPayload,
        businessNumber: savedRule.businessNumber ?? row.businessNumber ?? null,
        vatReportingDate: periodLabelByRow.get(id) ?? null,
      });
    }

    if (rowsSkippedDueToLockedPeriod.length > 0) {
      this.logger.log(
        `applyRuleToExistingTransactions: skipped ${rowsSkippedDueToLockedPeriod.length} backfill row(s) whose natural period was locked.`,
      );
    }

    return writable.length;
  }


  /** Loads businesses by number, keyed by businessNumber. */
  private async loadBusinessMap(
    userId: string,
    businessNumbers: string[],
  ): Promise<Map<string, Business>> {
    if (businessNumbers.length === 0) return new Map();
    const unique = Array.from(new Set(businessNumbers));
    const rows = await this.businessRepo.find({
      where: { firebaseId: userId, businessNumber: In(unique) },
    });
    return new Map(rows.map((b) => [b.businessNumber!, b]));
  }


  /**
   * For each business, returns the set of period labels that have at least
   * one locked transaction — used during backfill to skip writing into a
   * report that was already submitted.
   */
  private async loadLockedPeriodsByBusiness(
    userId: string,
    businessNumbers: string[],
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (businessNumbers.length === 0) return result;
    const rows = await this.slimRepo
      .createQueryBuilder('slim')
      .select('slim.businessNumber', 'businessNumber')
      .addSelect('slim.vatReportingDate', 'periodLabel')
      .where('slim.userId = :userId', { userId })
      .andWhere('slim.businessNumber IN (:...bns)', { bns: businessNumbers })
      .andWhere('slim.isLocked = TRUE')
      .andWhere('slim.vatReportingDate IS NOT NULL')
      .distinct(true)
      .getRawMany<{ businessNumber: string; periodLabel: string }>();
    for (const r of rows) {
      if (!result.has(r.businessNumber)) result.set(r.businessNumber, new Set());
      result.get(r.businessNumber)!.add(r.periodLabel);
    }
    return result;
  }

  /**
   * Deterministic rule matching.
   *
   * Step 1: Filter rules that fully match all conditions present in the rule.
   * Step 2: Score each match (+1 per condition field: commentPattern,
   *         sum range, date range).  Higher score = higher priority.
   * Step 3: Tie-break by updatedAt desc (newest rule wins).
   *
   * Returns null if no rule matches.
   *
   * SQL NOT IN is never used here.  Rules are pre-loaded for the batch,
   * and filtering is done in-process.
   */
  private matchRule(
    tx: NormalizedTransaction,
    rules: ClassifiedTransactions[],
  ): ClassifiedTransactions | null {
    if (!tx.billId) return null;

    // Step 1: full match filter.
    const matching = rules.filter((rule) => {
      if (rule.billId !== tx.billId) return false;
      if (rule.transactionName !== tx.merchantName) return false;

      // commentPattern: if rule defines it, transaction note must match.
      if (rule.commentPattern !== null && rule.commentPattern !== undefined) {
        const note = tx.note ?? '';
        if (rule.commentMatchType === 'equals') {
          if (note !== rule.commentPattern) return false;
        } else {
          if (!note.includes(rule.commentPattern)) return false;
        }
      }

      // Sum range: if rule defines minAbsSum or maxAbsSum, amount must be in range.
      const absAmount = Math.abs(tx.amount);
      if (rule.minAbsSum !== null && rule.minAbsSum !== undefined) {
        if (absAmount < rule.minAbsSum) return false;
      }
      if (rule.maxAbsSum !== null && rule.maxAbsSum !== undefined) {
        if (absAmount > rule.maxAbsSum) return false;
      }

      // Date range: if rule defines startDate or endDate, transactionDate must be in range.
      if (rule.startDate) {
        if (tx.transactionDate < new Date(rule.startDate)) return false;
      }
      if (rule.endDate) {
        if (tx.transactionDate > new Date(rule.endDate)) return false;
      }

      return true;
    });

    if (matching.length === 0) return null;
    if (matching.length === 1) return matching[0];

    // Step 2: specificity score.
    type ScoredRule = { rule: ClassifiedTransactions; score: number };
    const scored: ScoredRule[] = matching.map((rule) => {
      let score = 0;
      if (rule.commentPattern !== null && rule.commentPattern !== undefined) score++;
      if (rule.minAbsSum !== null || rule.maxAbsSum !== null) score++;
      if (rule.startDate !== null || rule.endDate !== null) score++;
      return { rule, score };
    });

    // Step 3: sort by score desc, then updatedAt desc (tie-breaker).
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.rule.updatedAt ? new Date(a.rule.updatedAt).getTime() : 0;
      const bTime = b.rule.updatedAt ? new Date(b.rule.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    return scored[0].rule;
  }

  private buildCacheRow(
    userId: string,
    tx: NormalizedTransaction,
  ): Partial<FullTransactionCache> {
    return {
      userId,
      externalTransactionId: tx.externalTransactionId,
      billId: tx.billId,
      billName: tx.billName,
      merchantName: tx.merchantName,
      amount: tx.amount,
      currency: tx.currency ?? 'ILS',
      transactionDate: tx.transactionDate,
      paymentDate: tx.paymentDate,
      paymentIdentifier: tx.paymentIdentifier,
      businessNumber: tx.businessNumber,
      note: tx.note,
      category: null,
      subCategory: null,
      vatPercent: 0,
      taxPercent: 0,
      reductionPercent: 0,
      isEquipment: false,
      isRecognized: false,
      confirmed: false,
      vatReportingDate: null,
      classificationType: null,
    };
  }

  private buildCacheRowWithSlim(
    userId: string,
    tx: NormalizedTransaction,
    slim: SlimTransaction,
  ): Partial<FullTransactionCache> {
    return {
      ...this.buildCacheRow(userId, tx),
      category: slim.category,
      subCategory: slim.subCategory,
      vatPercent: slim.vatPercent,
      taxPercent: slim.taxPercent,
      reductionPercent: slim.reductionPercent,
      isEquipment: slim.isEquipment,
      isRecognized: slim.isRecognized,
      confirmed: slim.confirmed,
      vatReportingDate: slim.vatReportingDate,
      classificationType: slim.classificationType,
      // Preserve the user's per-row override if one is set; otherwise fall
      // back to the bill default already present on the base cache row.
      ...(slim.businessNumber != null && { businessNumber: slim.businessNumber }),
    };
  }

  private buildCacheRowWithRule(
    userId: string,
    tx: NormalizedTransaction,
    rule: ClassifiedTransactions,
  ): Partial<FullTransactionCache> {
    return {
      ...this.buildCacheRow(userId, tx),
      category: rule.category,
      subCategory: rule.subCategory,
      vatPercent: rule.vatPercent,
      taxPercent: rule.taxPercent,
      reductionPercent: rule.reductionPercent,
      isEquipment: rule.isEquipment,
      isRecognized: rule.isRecognized,
      classificationType: ClassificationType.RULE,
      // Rule-level override wins over the bill default on the base cache row.
      ...(rule.businessNumber != null && { businessNumber: rule.businessNumber }),
    };
  }

  /**
   * Maps a FullTransactionCache row to the legacy Transactions response shape.
   * Keeps the frontend working without changes during the cutover.
   */
  private mapCacheToLegacyShape(row: FullTransactionCache): Record<string, any> {
    return {
      id: row.id,
      finsiteId: row.externalTransactionId,
      userId: row.userId,
      paymentIdentifier: row.paymentIdentifier,
      billName: row.billName,
      businessNumber: row.businessNumber,
      name: row.merchantName,
      note2: row.note,
      billDate: row.transactionDate,
      payDate: row.paymentDate,
      sum: row.amount,
      currency: row.currency ?? 'ILS',
      category: row.category,
      subCategory: row.subCategory,
      isRecognized: row.isRecognized,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      isEquipment: row.isEquipment,
      reductionPercent: row.reductionPercent,
      vatReportingDate: row.vatReportingDate,
      isLocked: row.isLocked,
      confirmed: row.confirmed,
    };
  }

  private async updateCacheState(userId: string): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000,
    );
    await this.cacheStateRepo.upsert(
      { userId, lastBuiltAt: now, expiresAt } as UserTransactionCacheState,
      ['userId'],
    );
  }

  /**
   * Daily cache cleanup entrypoint.
   * Intended to be called from AppService daily-task flow.
   */
  async handleDailyCacheCleanup(): Promise<void> {
    await this.runDailyCacheCleanup('daily-task');
  }

  /**
   * Shared cleanup logic for both daily runs.
   *
   * Runs entirely inside a single DB transaction:
   *   1. SELECT eligible user IDs (WHERE neither stage is 'running') — SQL-filtered, no JS loop.
   *   2. DELETE their rows from full_transactions_cache.
   *   3. DELETE their row from user_transaction_cache_state.
   *   4. UPDATE user_sync_state to empty — with a WHERE NOT running guard for race safety.
   *
   * If any step fails the transaction rolls back and no partial state is written.
   * Users whose sync starts between the SELECT and the UPDATE are protected by the guard
   * in step 4 — their row simply won't be updated.
   *
   * Israel Standard Time = UTC+2 → 03:00 fires at 01:00 UTC in winter.
   * Israel Daylight Time = UTC+3 → 03:00 fires at 00:00 UTC in summer.
   */
  async getFlowAnalysis(
    userId: string,
    startDate: string,
    endDate: string,
    billId: number,
    lineFilterType: 'all' | 'category' | 'subCategory' | 'merchant' | 'paymentMethod',
    lineFilterValue?: string,
  ): Promise<FlowAnalysisResponse> {
    // ── Monthly flow query (affected by lineFilter) ──────────────────────────
    const monthlyQb = this.cacheRepo
      .createQueryBuilder('c')
      .select("DATE_FORMAT(c.transactionDate, '%Y-%m')", 'month')
      .addSelect('SUM(CASE WHEN c.amount > 0 THEN c.amount ELSE 0 END)', 'incomes')
      .addSelect('SUM(CASE WHEN c.amount < 0 THEN ABS(c.amount) ELSE 0 END)', 'expenses')
      .where('c.userId = :userId', { userId })
      .andWhere('c.billId = :billId', { billId })
      .andWhere('c.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy("DATE_FORMAT(c.transactionDate, '%Y-%m')")
      .orderBy("DATE_FORMAT(c.transactionDate, '%Y-%m')", 'ASC');

    if (lineFilterType !== 'all' && lineFilterValue) {
      const columnMap: Record<string, string> = {
        category:      'c.category',
        subCategory:   'c.subCategory',
        merchant:      'c.merchantName',
        paymentMethod: 'c.paymentIdentifier',
      };
      monthlyQb.andWhere(`${columnMap[lineFilterType]} = :lineFilterValue`, { lineFilterValue });
    }

    const monthlyRaw = await monthlyQb.getRawMany<{ month: string; incomes: string; expenses: string }>();

    // Fill every month in range so there are no gaps in the chart
    const monthlyMap = new Map(monthlyRaw.map(r => [r.month, r]));
    const monthlyFlow: MonthlyFlowPoint[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const endMonth = endDate.substring(0, 7);
    cursor.setDate(1);
    while (true) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const raw = monthlyMap.get(key);
      monthlyFlow.push({
        month: key,
        expenses: raw ? Math.round(parseFloat(raw.expenses) * 100) / 100 : 0,
        incomes:  raw ? Math.round(parseFloat(raw.incomes)  * 100) / 100 : 0,
      });
      if (key === endMonth) break;
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const totalExpenses = monthlyFlow.reduce((s, m) => s + m.expenses, 0);
    const totalIncomes  = monthlyFlow.reduce((s, m) => s + m.incomes,  0);

    // ── Category breakdown query (NOT affected by lineFilter) ────────────────
    const categoryRaw = await this.cacheRepo
      .createQueryBuilder('c')
      .select('c.category', 'label')
      .addSelect('SUM(ABS(c.amount))', 'amount')
      .where('c.userId = :userId', { userId })
      .andWhere('c.billId = :billId', { billId })
      .andWhere('c.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('c.amount < 0')
      .groupBy('c.category')
      .orderBy('SUM(ABS(c.amount))', 'DESC')
      .getRawMany<{ label: string | null; amount: string }>();

    const categoryTotal = categoryRaw.reduce((s, r) => s + parseFloat(r.amount), 0);
    const toPercent = (amount: number) =>
      categoryTotal > 0 ? Math.round((amount / categoryTotal) * 1000) / 10 : 0;

    const expensesByCategory = categoryRaw.map(r => {
      const amount = Math.round(parseFloat(r.amount) * 100) / 100;
      return { label: r.label ?? null, amount, percentage: toPercent(amount) };
    });

    return { totalExpenses, totalIncomes, monthlyFlow, expensesByCategory };
  }

  private async runDailyCacheCleanup(label: string): Promise<void> {
    this.logger.log(`Daily cache cleanup started (${label} Asia/Jerusalem)`);
    try {
      let cleanedCount = 0;
      let cacheDeleted = 0;
      let stateDeleted = 0;

      await this.dataSource.transaction(async (manager) => {
        // Step 1 — SQL-efficient: get eligible user IDs directly from DB, no JS filtering.
        const rows = await manager
          .createQueryBuilder(UserSyncState, 'uss')
          .select('uss.userId', 'userId')
          .where('uss.fullProcessStatus != :r', { r: 'running' })
          .getRawMany<{ userId: string }>();

        const eligibleUserIds = rows.map(r => r.userId);
        cleanedCount = eligibleUserIds.length;

        if (eligibleUserIds.length === 0) return;

        // Step 2 — delete cache rows for eligible users only.
        const cacheResult = await manager.delete(FullTransactionCache, { userId: In(eligibleUserIds) });
        cacheDeleted = cacheResult.affected ?? 0;

        // Step 3 — delete cache-state rows for eligible users only.
        const stateResult = await manager.delete(UserTransactionCacheState, { userId: In(eligibleUserIds) });
        stateDeleted = stateResult.affected ?? 0;

        // Step 4 — mark eligible users as empty, guarded against races.
        await manager
          .createQueryBuilder()
          .update(UserSyncState)
          .set({ fullProcessStatus: 'empty' })
          .where('userId IN (:...userIds)', { userIds: eligibleUserIds })
          .andWhere('fullProcessStatus != :r', { r: 'running' })
          .execute();
      });

      if (cleanedCount === 0) {
        this.logger.log(`Daily cache cleanup (${label}) — no eligible users (all currently running)`);
        return;
      }

      this.logger.log(
        `Daily cache cleanup (${label}) done — ` +
        `users cleaned: ${cleanedCount}, ` +
        `cache rows deleted: ${cacheDeleted}, ` +
        `cache-state rows deleted: ${stateDeleted}`,
      );
    } catch (err: any) {
      this.logger.error(`Daily cache cleanup (${label}) failed`, err?.stack ?? err);
    }
  }
}
