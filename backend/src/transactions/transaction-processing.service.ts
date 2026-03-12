import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, Between, MoreThanOrEqual, LessThanOrEqual, Brackets } from 'typeorm';

import { SlimTransaction } from './slim-transaction.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { UserTransactionCacheState } from './user-transaction-cache-state.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';

import { NormalizedTransaction } from './interfaces/normalized-transaction.interface';
import { ProcessingResult } from './interfaces/processing-result.interface';
import { ClassifyManuallyDto } from './dtos/classify-manually.dto';
import { ClassifyWithRuleDto } from './dtos/classify-with-rule.dto';
import { ClassifyWithRuleResult } from './interfaces/classify-with-rule-result.interface';
import { ClassificationType } from './enums/classification-type.enum';

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
  ) {}

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
    };

    const inputUniqueIds = new Set(transactions.map(tx => tx.externalTransactionId));
    this.logger.log(
      `[DIAG] PROCESS_INPUT | userId=${userId} | totalReceived=${transactions.length} | uniqueExternalIds=${inputUniqueIds.size}`,
    );

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
          businessNumber: null,
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

      result.alreadyExistingInCache = existingCacheRows;
      result.newlySavedToCache = upsertExternalIds.length - existingCacheRows;

      this.logger.log(
        `[DIAG] PROCESS_CACHE | userId=${userId} | cacheUpsertsCount=${cacheUpserts.length} | uniqueForCache=${upsertExternalIds.length} | alreadyExisting=${existingCacheRows} | newlySaved=${result.newlySavedToCache}`,
      );

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
   *  - If slim row exists with vatReportingDate != null → blocked (VAT lock).
   *
   * ONE_TIME classifications can be updated manually again as long as the
   * VAT lock is not set.  Rules will never override a ONE_TIME slim row
   * (STEP 1 short-circuits rule matching when a slim row exists).
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
    if (slim?.vatReportingDate != null) {
      throw new BadRequestException(
        `Transaction "${dto.externalTransactionId}" is locked: vatReportingDate is already set.`,
      );
    }

    // 4. Upsert slim with ONE_TIME.
    await this.slimRepo.upsert(
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
        vatReportingDate: null,
        businessNumber: slim?.businessNumber ?? null,
      } as SlimTransaction,
      ['userId', 'externalTransactionId'],
    );

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
      },
    );
  }

  /**
   * Rule-based classification (isSingleUpdate = false).
   *
   * Guard order (checked BEFORE any write):
   *
   *  1. billId must not be null.
   *
   *  2. vatReportingDate != null → HARD STOP.
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
   *    Effective date range lower bound: dto.startDate ?? cacheRow.transactionDate.
   *    Effective date range upper bound: dto.endDate (absent = no upper bound).
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

    // Guard: VAT-reported → absolute stop. No writes at all.
    if (slim?.vatReportingDate != null) {
      return {
        status: 'blocked_vat_reported',
        message:
          'Transaction was already VAT-reported and cannot be changed.',
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

    const classificationFields = {
      category: dto.category,
      subCategory: dto.subCategory,
      vatPercent: dto.vatPercent,
      taxPercent: dto.taxPercent,
      reductionPercent: dto.reductionPercent,
      isEquipment: dto.isEquipment,
      isRecognized: dto.isRecognized,
      isExpense: dto.isExpense ?? false,
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

    // 5. Upsert slim row with RULE classification.
    await this.slimRepo.upsert(
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
        vatReportingDate: null,
        businessNumber: slim?.businessNumber ?? null,
      } as SlimTransaction,
      ['userId', 'externalTransactionId'],
    );

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
      },
    );

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
   * Backfills a freshly saved RULE classification to all existing matching
   * cache rows for the same user.
   *
   * Effective date range:
   *   lower bound = dto.startDate ?? cacheRow.transactionDate
   *   upper bound = dto.endDate    (no upper bound when absent)
   *
   * Skips rows where the slim row has:
   *   - classificationType = ONE_TIME
   *   - vatReportingDate   != null
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
    const effectiveStart = dto.startDate
      ? new Date(dto.startDate)
      : new Date(cacheRow.transactionDate);

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

    // 4. Exclude protected rows (ONE_TIME or VAT-reported).
    const eligible = filtered.filter((row) => {
      const slim = slimByExternalId.get(row.externalTransactionId);
      if (!slim) return true;
      if (slim.classificationType === ClassificationType.ONE_TIME) return false;
      if (slim.vatReportingDate != null) return false;
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

    const slimUpserts: Partial<SlimTransaction>[] = eligible.map((row) => {
      const existingSlim = slimByExternalId.get(row.externalTransactionId);
      return {
        userId,
        externalTransactionId: row.externalTransactionId,
        billId: row.billId!,
        classificationType: ClassificationType.RULE,
        classificationRuleId: savedRule.id,
        ...classificationPayload,
        confirmed: existingSlim?.confirmed ?? false,
        vatReportingDate: null,
        businessNumber: existingSlim?.businessNumber ?? null,
      };
    });

    await this.slimRepo.upsert(slimUpserts as SlimTransaction[], [
      'userId',
      'externalTransactionId',
    ]);

    // 6. Bulk-update cache overlay.
    const eligibleIds = eligible.map((r) => r.externalTransactionId);
    await this.cacheRepo
      .createQueryBuilder()
      .update(FullTransactionCache)
      .set({
        ...classificationPayload,
        classificationType: ClassificationType.RULE,
      })
      .where('userId = :userId', { userId })
      .andWhere('externalTransactionId IN (:...ids)', { ids: eligibleIds })
      .execute();

    return eligible.length;
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
      category: row.category,
      subCategory: row.subCategory,
      isRecognized: row.isRecognized,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      isEquipment: row.isEquipment,
      reductionPercent: row.reductionPercent,
      vatReportingDate: row.vatReportingDate,
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
}
