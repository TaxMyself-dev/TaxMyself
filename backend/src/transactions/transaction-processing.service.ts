import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SlimTransaction } from './slim-transaction.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { UserTransactionCacheState } from './user-transaction-cache-state.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { Source } from './source.entity';

import { NormalizedTransaction } from './interfaces/normalized-transaction.interface';
import { ProcessingResult } from './interfaces/processing-result.interface';
import { ClassifyManuallyDto } from './dtos/classify-manually.dto';
import { ClassificationType } from './enums/classification-type.enum';

/** Hours before a user's full_transactions_cache is considered stale. */
const CACHE_TTL_HOURS = 24;

interface BillInfo {
  billId: number;
  billName: string;
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
      duplicatesInCache: 0,
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

    // UPSERT full_transactions_cache: refresh provider data and overlay on
    // conflict (userId, externalTransactionId).
    if (cacheUpserts.length > 0) {
      await this.cacheRepo.upsert(cacheUpserts as FullTransactionCache[], [
        'userId',
        'externalTransactionId',
      ]);
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
