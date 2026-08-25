import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { ExpenseApprovalStatus, JournalReferenceType } from '../enum';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { JournalEntryInput } from '../bookkeeping/dto/journal-entry-input.interface';
import { AssetDepreciationPosting } from './asset-depreciation-posting.entity';
import {
  calculateDepreciationSchedule,
  dateOnly,
  DepreciationYearCalculation,
} from './depreciation-calculation';

const DEPRECIATION_EXPENSE_ACCOUNT_CODE = '61300';

@Injectable()
export class DepreciationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bookkeepingService: BookkeepingService,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(AssetDepreciationPosting)
    private readonly postingRepo: Repository<AssetDepreciationPosting>,
  ) {}

  /** Pure calculation entry point shared with Form 1342. */
  calculateThroughYear(expense: Expense, throughYear: number): DepreciationYearCalculation[] {
    return calculateDepreciationSchedule(expense, throughYear);
  }

  /**
   * Expense-create path: materialize only the activation year's annual
   * posting. Later years remain absent until a P&L preparation asks for them.
   */
  async ensureActivationYear(expense: Expense, manager?: EntityManager): Promise<void> {
    const activationDate = dateOnly((expense.activationDate ?? expense.date) as any);
    await this.ensureExpenseThroughYear(expense, Number(activationDate.slice(0, 4)), manager);
  }

  /**
   * P&L preparation path: materialize every missing year from activation
   * through the report's ending year. Running all assets in one transaction
   * keeps the report from observing a half-prepared depreciation run.
   */
  async ensureForReport(
    firebaseId: string,
    businessNumber: string,
    endDate: Date,
  ): Promise<void> {
    if (!firebaseId || !businessNumber || !endDate || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('firebaseId, businessNumber and a valid endDate are required');
    }
    const throughYear = endDate.getUTCFullYear();

    await this.dataSource.transaction(async (manager) => {
      const expenses = await manager.getRepository(Expense).find({
        where: {
          userId: firebaseId,
          businessNumber,
          isEquipmentSnapshot: true,
          approvalStatus: ExpenseApprovalStatus.APPROVED,
        },
        order: { date: 'ASC' },
      });
      for (const expense of expenses) {
        await this.ensureExpenseThroughYear(expense, throughYear, manager);
      }
    });
  }

  /**
   * Recalculate every already-materialized year plus the activation year.
   * Used after equipment edits/reclassification so future-dated entries stay
   * coherent without generating new future years that nobody requested.
   */
  async syncExistingYears(expense: Expense, manager?: EntityManager): Promise<void> {
    const run = async (m: EntityManager): Promise<void> => {
      const postingRepo = m.getRepository(AssetDepreciationPosting);
      const existing = await postingRepo.find({ where: { expenseId: expense.id } });

      if (!this.isDepreciable(expense)) {
        await this.deletePostingRows(existing, expense.businessNumber, m);
        return;
      }

      const activationYear = Number(
        dateOnly((expense.activationDate ?? expense.date) as any).slice(0, 4),
      );
      const maxExistingYear = existing.reduce(
        (max, row) => Math.max(max, row.taxYear),
        activationYear,
      );
      await this.ensureExpenseThroughYear(expense, maxExistingYear, m);

      const expectedYears = new Set(
        this.calculateThroughYear(expense, maxExistingYear).map((row) => row.taxYear),
      );
      await this.deletePostingRows(
        existing.filter((row) => !expectedYears.has(row.taxYear)),
        expense.businessNumber,
        m,
      );
    };

    if (manager) return run(manager);
    await this.dataSource.transaction(run);
  }

  async deleteForExpense(expense: Expense, manager?: EntityManager): Promise<void> {
    const run = async (m: EntityManager): Promise<void> => {
      const repo = m.getRepository(AssetDepreciationPosting);
      const rows = await repo.find({ where: { expenseId: expense.id } });
      await this.deletePostingRows(rows, expense.businessNumber, m);
    };
    if (manager) return run(manager);
    await this.dataSource.transaction(run);
  }

  private isDepreciable(expense: Expense): boolean {
    return !!expense.isEquipmentSnapshot
      && expense.approvalStatus === ExpenseApprovalStatus.APPROVED
      && !!expense.accountCodeSnapshot
      && Number(expense.sum) > 0
      && Number(expense.reductionPercentSnapshot) > 0;
  }

  private async ensureExpenseThroughYear(
    expense: Expense,
    throughYear: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (!this.isDepreciable(expense)) return;

    const run = async (m: EntityManager): Promise<void> => {
      const expenseRepo = m.getRepository(Expense);
      if (!expense.activationDate) {
        const fallback = dateOnly(expense.date as any);
        expense.activationDate = fallback as any;
        await expenseRepo.update(expense.id, { activationDate: fallback as any });
      }

      const rows = this.calculateThroughYear(expense, throughYear);
      for (const calculation of rows) {
        await this.ensurePosting(expense, calculation, m);
      }
    };

    if (manager) return run(manager);
    await this.dataSource.transaction(run);
  }

  private async ensurePosting(
    expense: Expense,
    calculation: DepreciationYearCalculation,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(AssetDepreciationPosting);
    const sourceAccountCode = expense.accountCodeSnapshot!;

    const snapshot = {
      expenseId: expense.id,
      firebaseId: expense.userId,
      businessNumber: expense.businessNumber,
      taxYear: calculation.taxYear,
      activationDateSnapshot: calculation.activationDate,
      originalCostSnapshot: calculation.originalCost,
      depreciationRateSnapshot: calculation.depreciationRate,
      activeDays: calculation.activeDays,
      daysInYear: calculation.daysInYear,
      amount: calculation.amount,
      sourceAccountCode,
    };

    // Atomic insert-or-refresh of the calculation snapshot. Repository.upsert()
    // cannot be used here: on MySQL, TypeORM tries to re-select generated/default
    // columns after the UPDATE branch, but this payload has the composite conflict
    // key rather than the generated primary id. That raises "entity id is not set".
    // The query-builder form keeps the same atomic database upsert while
    // updateEntity(false) disables that broken in-memory RETURNING emulation.
    // journalEntryNumber is deliberately omitted so an existing link can never
    // be nulled. The following SELECT FOR UPDATE serializes concurrent report
    // preparations before either can create a journal entry.
    await repo
      .createQueryBuilder()
      .insert()
      .into(AssetDepreciationPosting)
      .values(snapshot)
      .orUpdate(
        [
          'firebaseId',
          'businessNumber',
          'activationDateSnapshot',
          'originalCostSnapshot',
          'depreciationRateSnapshot',
          'activeDays',
          'daysInYear',
          'amount',
          'sourceAccountCode',
        ],
        ['expenseId', 'taxYear'],
      )
      .updateEntity(false)
      .execute();

    const posting = await repo.findOne({
      where: { expenseId: expense.id, taxYear: calculation.taxYear },
      lock: { mode: 'pessimistic_write' },
    });
    if (!posting) throw new Error('Depreciation posting upsert did not return a row');

    const input = this.buildJournalInput(expense, posting, calculation.amount);
    if (posting.journalEntryNumber != null) {
      const updated = await this.bookkeepingService.updateJournalEntryFull(
        posting.journalEntryNumber,
        expense.businessNumber,
        input,
        manager,
      );
      if (updated) return;
    }

    const created = await this.bookkeepingService.createJournalEntry(input, manager);
    await repo.update(posting.id, { journalEntryNumber: created.entryNumber });
    posting.journalEntryNumber = created.entryNumber;
  }

  private buildJournalInput(
    expense: Expense,
    posting: AssetDepreciationPosting,
    amount: number,
  ): JournalEntryInput {
    const postingDate = `${posting.taxYear}-12-31`;
    const description = `פחת ${posting.taxYear} — ${expense.accountNameSnapshot ?? expense.subCategory ?? expense.supplier}`;

    return {
      firebaseId: expense.userId,
      issuerBusinessNumber: expense.businessNumber,
      subCategory: expense.subCategory ?? null,
      counterAccountCode: posting.sourceAccountCode,
      counterPartyName: expense.supplier ?? null,
      documentTotal: amount,
      date: postingDate,
      valueDate: postingDate,
      vatReportingPeriod: null,
      referenceType: JournalReferenceType.DEPRECIATION,
      referenceId: posting.id,
      description,
      notes: `נוצר אוטומטית מנכס שמקורו בהוצאה ${expense.id}`,
      lines: [
        {
          accountCode: DEPRECIATION_EXPENSE_ACCOUNT_CODE,
          debit: amount,
          amountBeforeVat: amount,
          vatAmount: 0,
          isEquipment: false,
          taxPercent: 100,
          vatPercent: 0,
          amountForTax: amount,
          subCategoryName: expense.subCategory ?? null,
        },
        {
          accountCode: posting.sourceAccountCode,
          credit: amount,
          amountBeforeVat: 0,
          vatAmount: 0,
          isEquipment: true,
          taxPercent: 0,
          vatPercent: 0,
          amountForTax: 0,
          subCategoryName: expense.subCategory ?? null,
        },
      ],
    };
  }

  private async deletePostingRows(
    rows: AssetDepreciationPosting[],
    businessNumber: string,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(AssetDepreciationPosting);
    for (const row of rows) {
      if (row.journalEntryNumber != null) {
        await this.bookkeepingService.deleteJournalEntry(
          row.journalEntryNumber,
          businessNumber,
          manager,
        );
      }
      await repo.delete(row.id);
    }
  }
}
