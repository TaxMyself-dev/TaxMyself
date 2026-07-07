import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Not, Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { buildVatReportPdf } from './vat-report-pdf';
import { buildPnlReportPdf } from './pnl-report-pdf';
import { AdvanceIncomeTaxReportDto } from './dtos/advance-income-tax-report.dto';
import { ExpensePnlDto, PnLReportDto } from './dtos/pnl-report.dto';
import { LedgerAccountDto, LedgerLineDto, LedgerReportDto } from './dtos/ledger-report.dto';
import { Form1342ReportDto, Form1342ReportRowDto } from './dtos/depreciation-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { SharedService } from 'src/shared/shared.service';
import { User } from '../users/user.entity';
import { BusinessType, DOC_TYPE_INFO, DocumentSummaryRow, DocumentType, FIELD_MAP, isExemptBusinessType, JournalReferenceType, ListSummaryRow, PaymentMethodType, UniformFileTypeCodeMap, UniformSummaries} from 'src/enum';
import { Documents } from 'src/documents/documents.entity';
import { DocLines } from 'src/documents/doc-lines.entity';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as archiver from 'archiver';
import * as stream from 'stream';
import * as readline from 'readline';
import * as iconv from 'iconv-lite';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';
import { Business } from 'src/business/business.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { VATReportingType, ExpenseReportScope } from 'src/enum';

/** Maps referenceType strings → Hebrew label for the כרטסת סוג תנועה column. */
const LEDGER_MOVEMENT_LABELS: Record<string, string> = {
  TAX_INVOICE:         'חשבונית מס',
  TAX_INVOICE_RECEIPT: 'חשבונית מס קבלה',
  CREDIT_INVOICE:      'חשבונית זיכוי',
  RECEIPT:             'קבלה',
  EXPENSE:             'הוצאה',
  PRICE_QUOTE:         'הצעת מחיר',
};

@Injectable()
export class ReportsService {

  private recordCounter = 1;
  private readonly logger = new Logger(ReportsService.name);  // Log service name
  private readonly generatedFolder = "src/generated/";  // Define folder for uploads
  private readonly debugFolder = "src/debug/";  // Define folder for debug files

  private recordSummary = { A100: 1, B100: 0, B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 1 };
  private totalLists = 0;

  constructor(
    private expensesService: ExpensesService,
    private sharedService: SharedService,
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(Documents)
    private documentsRepo: Repository<Documents>,
    @InjectRepository(DocLines)
    private docLinesRepo: Repository<DocLines>,
    @InjectRepository(DocPayments)
    private docPaymentsRepo: Repository<DocPayments>,
    @InjectRepository(User) 
    private userRepo: Repository<User>,
    @InjectRepository(JournalEntry) 
    private JournalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine) 
    private JournalLineRepo: Repository<JournalLine>,
    @InjectRepository(DefaultBookingAccount)
    private defaultBookingAccountRepo: Repository<DefaultBookingAccount>,
    @InjectRepository(SlimTransaction)
    private slimRepo: Repository<SlimTransaction>,
    @InjectRepository(FullTransactionCache)
    private cacheRepo: Repository<FullTransactionCache>,
  ) {
    if (!fs.existsSync(this.debugFolder)) {
      fs.mkdirSync(this.debugFolder, { recursive: true });
    }
  }


  /**
   * Returns whether the report covering `(businessNumber, startDate)` has been
   * marked as submitted yet. Drives the VAT/PnL page UI — when true, the
   * "סמן כדווח" button is replaced with a "הדוח הוגש" success indicator.
   *
   * A period is considered submitted if at least one transaction in the slim
   * table is stamped with the period label AND has `isLocked = true`.
   */
  async getReportSubmissionStatus(
    userId: string,
    businessNumber: string,
    startDate: Date,
  ): Promise<{ isSubmitted: boolean; periodLabel: string }> {
    const business = await this.businessRepo.findOne({
      where: { firebaseId: userId, businessNumber },
    });
    if (!business) {
      throw new NotFoundException(`Business ${businessNumber} not found`);
    }
    const periodLabel = this.sharedService.buildReportPeriodLabel(
      business.businessType ?? BusinessType.EXEMPT,
      business.vatReportingType ?? VATReportingType.NOT_REQUIRED,
      startDate,
    );
    const lockedCount = await this.slimRepo.count({
      where: { userId, businessNumber, vatReportingDate: periodLabel, isLocked: true },
    });
    return { isSubmitted: lockedCount > 0, periodLabel };
  }


  /**
   * Marks every transaction in the given report period as `isLocked = true`
   * — i.e. the user clicked "סמן כדווח" after submitting the report at the
   * tax authority. Matches by the period label that confirm-trans already
   * stamped on `vatReportingDate`. Self-employed equivalent of the
   * accountant-workflow lock at ReportWorkflowService.setReported.
   */
  async markReportAsSubmitted(
    userId: string,
    businessNumber: string,
    startDate: Date,
  ): Promise<{ count: number; periodLabel: string }> {
    const business = await this.businessRepo.findOne({
      where: { firebaseId: userId, businessNumber },
    });
    if (!business) {
      throw new NotFoundException(`Business ${businessNumber} not found`);
    }
    const periodLabel = this.sharedService.buildReportPeriodLabel(
      business.businessType ?? BusinessType.EXEMPT,
      business.vatReportingType ?? VATReportingType.NOT_REQUIRED,
      startDate,
    );

    const slimResult = await this.slimRepo.update(
      { userId, businessNumber, vatReportingDate: periodLabel, isLocked: false },
      { isLocked: true },
    );
    await this.cacheRepo.update(
      { userId, businessNumber, vatReportingDate: periodLabel, isLocked: false },
      { isLocked: true },
    );

    this.logger.log(
      `markReportAsSubmitted: locked ${slimResult.affected ?? 0} transactions for ${businessNumber} / ${periodLabel}`,
    );
    return { count: slimResult.affected ?? 0, periodLabel };
  }


  /**
   * Compute the VAT report for a business+period and render it as a PDF buffer.
   * Used when a VAT report workflow is marked submitted, to snapshot the
   * as-filed figures. Returns the PDF bytes; storage is the caller's concern.
   */
  async generateVatReportPdfBuffer(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
    submittedAt: Date = new Date(),
  ): Promise<Buffer> {
    const data = await this.createVatReportFromJournal(
      firebaseId,
      businessNumber,
      startDate,
      endDate,
    );
    const business = await this.businessRepo.findOne({
      where: { businessNumber, firebaseId },
    });
    return buildVatReportPdf(data, {
      businessName: business?.businessName ?? businessNumber,
      businessNumber,
      periodStart: startDate,
      periodEnd: endDate,
      submittedAt,
    });
  }

  /**
   * Compute the VAT report for a business+period and render it as a PDF
   * buffer for the interactive "ייצא כ-PDF" button — includes the expense
   * line-item breakdown and omits the "הוגש בתאריך" line (report may not be
   * submitted yet). Server-rendered (pdfkit), same approach as the submitted
   * snapshot — no external template-fill service involved.
   */
  async generateVatReportPdfForExport(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    const [data, business, expenseRows] = await Promise.all([
      this.createVatReportFromJournal(firebaseId, businessNumber, startDate, endDate),
      this.businessRepo.findOne({ where: { businessNumber, firebaseId } }),
      this.expensesService.getExpensesForVatReport(firebaseId, businessNumber, startDate, endDate),
    ]);

    const expenses = expenseRows
      .filter((e) => Number(e.totalVatPayable ?? 0) !== 0)
      .map((e) => ({
        supplier: e.supplier ?? '',
        date: e.date ? this.formatLedgerDate(e.date) : '',
        sum: Number(e.sum) || 0,
        category: e.category ?? '',
        subCategory: e.subCategory ?? '',
        totalVatPayable: Number(e.totalVatPayable) || 0,
        totalTaxPayable: Number(e.totalTaxPayable) || 0,
      }));

    return buildVatReportPdf(data, {
      businessName: business?.businessName ?? businessNumber,
      businessNumber,
      periodStart: startDate,
      periodEnd: endDate,
      expenses,
    });
  }

  /**
   * Compute the P&L report for a business+period and render it as a PDF
   * buffer for the interactive "ייצא כ-PDF" button. Server-rendered
   * (pdfkit), same approach as the VAT report — no external template-fill
   * service involved.
   */
  async generatePnlReportPdfForExport(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    const [data, business] = await Promise.all([
      this.createPnLReportFromJournal(firebaseId, businessNumber, startDate, endDate),
      this.businessRepo.findOne({ where: { businessNumber, firebaseId } }),
    ]);
    return buildPnlReportPdf(data, {
      businessName: business?.businessName ?? businessNumber,
      businessNumber,
      periodStart: startDate,
      periodEnd: endDate,
    });
  }

  async getAdvanceIncomeTaxReportData(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AdvanceIncomeTaxReportDto> {
    try {
      const business = await this.businessRepo.findOne({
        where: { businessNumber, firebaseId },
      });
      const businessType = business?.businessType ?? null;

      if (isExemptBusinessType(businessType)) {
        return this.getAdvanceIncomeTaxReportDataForExempt(
          businessNumber,
          startDate,
          endDate,
          business,
        );
      }
      return this.getAdvanceIncomeTaxReportDataForLicensed(
        businessNumber,
        startDate,
        endDate,
        business,
      );
    } catch (error) {
      throw error;
    }
  }

  /** דוח מקדמות מס – עוסק מורשה/חברה: עסקאות חייבות, עסקאות פטורות, מע"מ עסקאות */
  private async getAdvanceIncomeTaxReportDataForLicensed(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
    business: { advanceTaxPercent?: number | null; businessType?: BusinessType | null } | null,
  ): Promise<AdvanceIncomeTaxReportDto> {
    const advanceTaxPercent = business?.advanceTaxPercent != null ? Number(business.advanceTaxPercent) : 0;

    const { vatableIncome: vatableTurnover, nonVatableIncome: nonVatableTurnover } =
      await this.getVatIncomeFromDocuments(businessNumber, startDate, endDate);
    const totalIncome = await this.getIncomeBeforeVat(businessNumber, startDate, endDate);

    const { vatOnTurnover } = await this.getTotalTurnoverIncludingVatAndVatOnTurnover(
      businessNumber,
      startDate,
      endDate,
      business?.businessType ?? null,
    );
    const taxWithholdingAtSource = await this.getWithholdingAtSourceSum(businessNumber, startDate, endDate);
    const totalAdvanceTax = Math.round(totalIncome * (advanceTaxPercent / 100));
    const totalToPay = totalAdvanceTax - taxWithholdingAtSource;

    return {
      businessType: business?.businessType ?? 'LICENSED',
      vatableTurnover,
      nonVatableTurnover,
      vatOnTurnover,
      totalIncome,
      advanceTaxPercent,
      totalAdvanceTax,
      taxWithholdingAtSource,
      totalToPay,
    };
  }

  /** דוח מקדמות מס – עוסק פטור: רק סך עסקאות (ללא פירוט מע"מ) */
  private async getAdvanceIncomeTaxReportDataForExempt(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
    business: { advanceTaxPercent?: number | null; businessType?: BusinessType | null } | null,
  ): Promise<AdvanceIncomeTaxReportDto> {
    const advanceTaxPercent = business?.advanceTaxPercent != null ? Number(business.advanceTaxPercent) : 0;

    const { totalTurnoverIncludingVat } = await this.getTotalTurnoverIncludingVatAndVatOnTurnover(
      businessNumber,
      startDate,
      endDate,
      BusinessType.EXEMPT,
    );
    const totalIncome = totalTurnoverIncludingVat;
    const taxWithholdingAtSource = await this.getWithholdingAtSourceSum(businessNumber, startDate, endDate);
    const totalAdvanceTax = Math.round(totalTurnoverIncludingVat * (advanceTaxPercent / 100));
    const totalToPay = totalAdvanceTax - taxWithholdingAtSource;

    return {
      businessType: 'EXEMPT',
      vatableTurnover: 0,
      nonVatableTurnover: 0,
      vatOnTurnover: 0,
      totalIncome,
      advanceTaxPercent,
      totalAdvanceTax,
      taxWithholdingAtSource,
      totalToPay,
    };
  }

  /** סה"כ עסקאות כולל מע"מ + סך מע"מ עסקאות לתקופה (לפי סוג עסק) */
  private async getTotalTurnoverIncludingVatAndVatOnTurnover(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
    businessType: BusinessType | null,
  ): Promise<{ totalTurnoverIncludingVat: number; vatOnTurnover: number }> {
    const base = this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false');

    if (isExemptBusinessType(businessType)) {
      const res = await base
        .clone()
        .andWhere('doc.docType = :type', { type: 'RECEIPT' })
        .andWhere('doc.valueDate BETWEEN :start AND :end', { start: startDate, end: endDate })
        .select('COALESCE(SUM(doc.sumAftDisWithVAT), 0)', 'totalInclVat')
        .addSelect('COALESCE(SUM(doc.vatSum), 0)', 'vat')
        .getRawOne<{ totalInclVat: string; vat: string }>();
      return {
        totalTurnoverIncludingVat: Number(res?.totalInclVat ?? 0),
        vatOnTurnover: Number(res?.vat ?? 0),
      };
    }

    const regular = await base
      .clone()
      .andWhere('doc.docType IN (:...types)', { types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT'] })
      .andWhere('doc.docDate BETWEEN :start AND :end', { start: startDate, end: endDate })
      .select('COALESCE(SUM(doc.sumAftDisWithVAT), 0)', 'totalInclVat')
      .addSelect('COALESCE(SUM(doc.vatSum), 0)', 'vat')
      .getRawOne<{ totalInclVat: string; vat: string }>();

    const credit = await this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false')
      .andWhere('doc.docType = :type', { type: 'CREDIT_INVOICE' })
      .andWhere('doc.docDate BETWEEN :start AND :end', { start: startDate, end: endDate })
      .select('COALESCE(SUM(doc.sumAftDisWithVAT), 0)', 'totalInclVat')
      .addSelect('COALESCE(SUM(doc.vatSum), 0)', 'vat')
      .getRawOne<{ totalInclVat: string; vat: string }>();

    const totalInclVat = Number(regular?.totalInclVat ?? 0) - Number(credit?.totalInclVat ?? 0);
    const vatSum = Number(regular?.vat ?? 0) - Number(credit?.vat ?? 0);
    return { totalTurnoverIncludingVat: totalInclVat, vatOnTurnover: vatSum };
  }

  /** סך ניכוי מס במקור ממסמכים בתקופה */
  private async getWithholdingAtSourceSum(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const res = await this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false')
      .andWhere('doc.docDate BETWEEN :start AND :end', { start: startDate, end: endDate })
      .select('COALESCE(SUM(doc.withholdingTaxAmount), 0)', 'total')
      .getRawOne<{ total: string }>();
    return Number(res?.total ?? 0);
  }


  // ───────────────────────────────────────────────────────────────────────────
  // VAT / P&L reports — computed from journal entries (journal_entry + journal_line).
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build the journal-entry period filter shared by both journal reports:
   * `vatReportingPeriod IN (labels) OR (vatReportingPeriod IS NULL AND date BETWEEN)`,
   * mirroring getExpensesByDates. Mutates `qb` in place.
   */
  private applyJournalPeriodFilter(
    qb: import('typeorm').SelectQueryBuilder<JournalLine>,
    periodLabels: string[],
    startDate: Date,
    endDate: Date,
  ): void {
    if (periodLabels.length > 0) {
      qb.andWhere(
        '(je.vatReportingPeriod IN (:...periodLabels) OR (je.vatReportingPeriod IS NULL AND je.date BETWEEN :startDate AND :endDate))',
        { periodLabels, startDate, endDate },
      );
    } else {
      qb.andWhere(
        '(je.vatReportingPeriod IS NULL AND je.date BETWEEN :startDate AND :endDate)',
        { startDate, endDate },
      );
    }
  }

  /**
   * VAT report computed from journal entries.
   * Income from 4000 (vatable) / 4010 (non-vatable) credit; output VAT from
   * 2400 (credit − debit, so credit notes reduce it); deductible input VAT from
   * 2410 debit split by isEquipment (expenses vs assets).
   */
  async createVatReportFromJournal(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<VatReportDto> {
    const business = await this.businessRepo.findOne({ where: { businessNumber, firebaseId } });
    if (!business) {
      throw new BadRequestException('Business not found or not owned by user');
    }

    const periodLabels = this.sharedService.expandPeriodLabelsInRange(
      business.businessType, business.vatReportingType, startDate, endDate,
    );

    const qb = this.JournalLineRepo.createQueryBuilder('jl')
      .innerJoin(JournalEntry, 'je', 'je.id = jl.journalEntryId')
      .where('je.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('je.firebaseId = :firebaseId', { firebaseId });
    this.applyJournalPeriodFilter(qb, periodLabels, startDate, endDate);

    const row = await qb
      // credit − debit so credit invoices (which post a DEBIT on 4000/4010/2400)
      // correctly REVERSE the income / output VAT instead of adding to it.
      .select("SUM(CASE WHEN jl.accountCode = '4000' THEN jl.credit - jl.debit ELSE 0 END)", 'vatableTurnover')
      .addSelect("SUM(CASE WHEN jl.accountCode = '4010' THEN jl.credit - jl.debit ELSE 0 END)", 'nonVatableTurnover')
      .addSelect("SUM(CASE WHEN jl.accountCode = '2400' THEN jl.credit - jl.debit ELSE 0 END)", 'outputVat')
      .addSelect("SUM(CASE WHEN jl.accountCode = '2410' AND jl.isEquipment = false THEN jl.debit ELSE 0 END)", 'vatRefundOnExpenses')
      .addSelect("SUM(CASE WHEN jl.accountCode = '2410' AND jl.isEquipment = true THEN jl.debit ELSE 0 END)", 'vatRefundOnAssets')
      .getRawOne<{
        vatableTurnover: string; nonVatableTurnover: string; outputVat: string;
        vatRefundOnExpenses: string; vatRefundOnAssets: string;
      }>();

    const vatableTurnover = Number(row?.vatableTurnover ?? 0);
    const nonVatableTurnover = Number(row?.nonVatableTurnover ?? 0);
    const outputVat = Number(row?.outputVat ?? 0);
    const vatRefundOnExpenses = Number(row?.vatRefundOnExpenses ?? 0);
    const vatRefundOnAssets = Number(row?.vatRefundOnAssets ?? 0);

    // vatPayment from ACTUAL posted output VAT (2400) minus input VAT, unlike
    // the legacy report which recomputes output VAT as turnover × rate.
    const vatPayment = outputVat - vatRefundOnExpenses - vatRefundOnAssets;

    return {
      vatableTurnover,
      nonVatableTurnover,
      vatRefundOnAssets,
      vatRefundOnExpenses,
      vatPayment,
      vatRate: this.sharedService.getVatRateByYear(startDate),
    };
  }

  /**
   * P&L report computed from journal entries.
   * Income = 4000 (credit − debit). Expenses grouped by the account's
   * pnlCategory for 5xxx/6xxx (debit − credit), EXCEPT 6200 (פחת) which is
   * surfaced as its own "הוצאות פחת" line. Equipment lines are excluded.
   * Depreciation here reflects whatever was posted to 6200.
   */
  async createPnLReportFromJournal(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PnLReportDto> {
    const business = await this.businessRepo.findOne({ where: { businessNumber, firebaseId } });
    if (!business) {
      throw new BadRequestException('Business not found or not owned by user');
    }

    const periodLabels = this.sharedService.expandPeriodLabelsInRange(
      business.businessType, business.vatReportingType, startDate, endDate,
    );

    const qb = this.JournalLineRepo.createQueryBuilder('jl')
      .innerJoin(JournalEntry, 'je', 'je.id = jl.journalEntryId')
      .innerJoin(DefaultBookingAccount, 'dba', 'dba.code = jl.accountCode')
      .where('je.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('je.firebaseId = :firebaseId', { firebaseId })
      .andWhere('dba.pnlCategory IS NOT NULL')
      .andWhere('jl.isEquipment = false');
    this.applyJournalPeriodFilter(qb, periodLabels, startDate, endDate);

    const rows = await qb
      .select('jl.accountCode', 'accountCode')
      .addSelect('dba.pnlCategory', 'pnlCategory')
      .addSelect('jl.debit', 'debit')
      .addSelect('jl.credit', 'credit')
      .addSelect('jl.amountForTax', 'amountForTax')
      .getRawMany<{ accountCode: string; pnlCategory: string; debit: string; credit: string; amountForTax: string }>();

    let totalIncome = 0;
    const expenseSumByCategory: { [category: string]: number } = {};

    for (const r of rows) {
      const code = String(r.accountCode);
      const debit = Number(r.debit) || 0;
      const credit = Number(r.credit) || 0;
      if (code === '4000' || code === '4010') {
        totalIncome += credit - debit;       // 4000 vatable; 4010 exempt (פטור) income
      } else if (code.startsWith('5') || code.startsWith('6')) {
        // Use amountForTax (= debit × taxPercent/100) so partial-deductibility
        // expenses (vehicle 45%, mixed-use) show the correct P&L amount, not the
        // gross debit. Label by the account's pnlCategory for consistent grouping.
        const category = String(r.pnlCategory);
        expenseSumByCategory[category] = (expenseSumByCategory[category] ?? 0) + (Number(r.amountForTax) || 0);
      }
    }

    const expenseDtos: ExpensePnlDto[] = Object.entries(expenseSumByCategory).map(
      ([category, total]) => ({ category, total }),
    );

    let totalExpenses = 0;
    for (const e of expenseDtos) totalExpenses += e.total;
    const netProfitBeforeTax = totalIncome - totalExpenses;

    return {
      income: Number(totalIncome.toFixed(2)),
      expenses: expenseDtos,
      netProfitBeforeTax: Number(netProfitBeforeTax.toFixed(2)),
    };
  }


  /**
   * כרטסת (ledger) report — per-account "cards", the professional accounting
   * layout. Each account lists its movements with a running balance that RESETS
   * per account, plus the counter-account(s) of each entry (GROUP_CONCAT of the
   * other lines in the same journal entry) and per-account totals.
   *
   * @param accountCode  when provided, only that account is returned; otherwise
   *                     all accounts that had movements in the range, ordered
   *                     1000, 2400, 2410, 4000, 5000, then others alphabetically.
   */
  async createLedgerReport(
    firebaseId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
    accountCode?: string | null,
  ): Promise<LedgerReportDto> {

    const business = await this.businessRepo.findOne({
      where: { businessNumber, firebaseId },
    });
    if (!business) {
      throw new BadRequestException('Business not found or not owned by user');
    }
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    // JournalEntry.date is a DATE-only column — compare on 'YYYY-MM-DD' strings
    // (inclusive both ends) to sidestep any datetime/timezone coercion.
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    const code = accountCode && accountCode.trim() ? accountCode.trim() : null;

    // One row per journal line. Counter-account comes directly from the entry
    // header (je.counterAccountCode) — no GROUP_CONCAT / self-join needed.
    const rawRows: any[] = await this.JournalLineRepo.query(
      `
      SELECT
        jl.accountCode        AS accountCode,
        je.entryNumber        AS entryNumber,
        je.date               AS date,
        je.valueDate          AS valueDate,
        je.vatDate            AS vatDate,
        je.vatReportingPeriod AS vatReportingPeriod,
        je.notes              AS notes,
        je.description        AS description,
        je.referenceType      AS referenceType,
        je.referenceId        AS referenceId,
        je.id                 AS journalEntryId,
        jl.debit              AS debit,
        jl.credit             AS credit,
        jl.amountBeforeVat    AS amountBeforeVat,
        jl.vatAmount          AS vatAmount,
        jl.taxPercent         AS taxPercent,
        jl.vatPercent         AS vatPercent,
        jl.amountForTax       AS amountForTax,
        je.subCategory        AS subCategory,
        jl.subCategoryName    AS subCategoryName,
        (
          SELECT jl2.accountCode
          FROM journal_line jl2
          WHERE jl2.journalEntryId = jl.journalEntryId
            AND jl2.id != jl.id
            AND (
              (jl.debit  > 0 AND jl2.credit > 0)
              OR (jl.credit > 0 AND jl2.debit  > 0)
            )
          ORDER BY jl2.lineInEntry
          LIMIT 1
        ) AS counterAccounts,
        je.counterPartyName   AS counterPartyName,
        je.documentTotal      AS documentTotal,
        d.currency            AS docCurrency,
        d.amountForeign       AS docAmountForeign,
        d.sumAftDisWithVAT    AS docSumWithVat,
        d.allocationNum       AS allocationNum
      FROM journal_line jl
      JOIN journal_entry je ON je.id = jl.journalEntryId
      -- Document-sourced entries only: match the issued document by (business,
      -- docType=referenceType, docNumber=referenceId). Expense/manual entries
      -- never match (their referenceType isn't a docType) → currency defaults to ILS.
      LEFT JOIN documents d
        ON d.issuerBusinessNumber = je.issuerBusinessNumber
        AND d.docType = je.referenceType
        AND d.docNumber = je.referenceId
      WHERE je.issuerBusinessNumber = ?
        AND je.firebaseId = ?
        AND je.date BETWEEN ? AND ?
        AND jl.accountCode != '1000'
        AND (? IS NULL OR jl.accountCode = ?)
      ORDER BY jl.accountCode, je.date, je.id, jl.lineInEntry
      `,
      [businessNumber, firebaseId, startStr, endStr, code, code],
    );

    // Opening balance per account = signed sum of all that account's lines
    // BEFORE the requested period. Direction (debit-/credit-normal) is applied
    // below per account type. Used for "יתרה לתקופה" (periodBalance).
    const openingRows: any[] = await this.JournalLineRepo.query(
      `
      SELECT jl.accountCode AS accountCode,
             COALESCE(SUM(jl.debit), 0)  AS sumDebit,
             COALESCE(SUM(jl.credit), 0) AS sumCredit
      FROM journal_line jl
      JOIN journal_entry je ON je.id = jl.journalEntryId
      WHERE je.issuerBusinessNumber = ?
        AND je.firebaseId = ?
        AND je.date < ?
        AND jl.accountCode != '1000'
        AND (? IS NULL OR jl.accountCode = ?)
      GROUP BY jl.accountCode
      `,
      [businessNumber, firebaseId, startStr, code, code],
    );
    const openingByCode = new Map<string, { sumDebit: number; sumCredit: number }>();
    for (const o of openingRows) {
      openingByCode.set(o.accountCode, {
        sumDebit: Number(o.sumDebit ?? 0),
        sumCredit: Number(o.sumCredit ?? 0),
      });
    }

    // Account name + type lookup from the chart of accounts.
    const chart = await this.defaultBookingAccountRepo.find();
    const nameByCode = new Map(chart.map((a) => [a.code, a.name]));
    const typeByCode = new Map(chart.map((a) => [a.code, a.type]));

    // Group lines by account (input is already ordered within each account).
    // Fix 2: skip zero-amount lines (debit = 0 AND credit = 0) — e.g. the VAT
    // line (2400) on a no-VAT RECEIPT. This keeps כרטיס 2400 from appearing
    // with empty amounts for עוסק פטור businesses (correct accounting behavior).
    const byCode = new Map<string, any[]>();
    for (const r of rawRows) {
      const ac = r.accountCode ?? '';
      if ((Number(r.debit) || 0) === 0 && (Number(r.credit) || 0) === 0) continue;
      const bucket = byCode.get(ac);
      if (bucket) bucket.push(r);
      else byCode.set(ac, [r]);
    }

    const orderedCodes = [...byCode.keys()].sort((a, b) =>
      this.compareLedgerAccountCodes(a, b),
    );

    const accounts: LedgerAccountDto[] = orderedCodes.map((ac) => {
      const rows = byCode.get(ac) as any[];
      // Fix 1: balance direction follows the account's natural side.
      //   asset / expense   → debit-normal  → balance += (debit - credit)
      //   income / liability/equity → credit-normal → balance += (credit - debit)
      const type = typeByCode.get(ac);
      const debitNormal = type === 'asset' || type === 'expense';

      // Opening balance (before the period), signed by the account's direction.
      const open = openingByCode.get(ac);
      const opening = open
        ? Number(
            (debitNormal
              ? open.sumDebit - open.sumCredit
              : open.sumCredit - open.sumDebit
            ).toFixed(2),
          )
        : 0;

      let running = 0;
      let totalDebit = 0;
      let totalCredit = 0;
      const lines: LedgerLineDto[] = rows.map((r) => {
        const debit = Number(r.debit ?? 0);
        const credit = Number(r.credit ?? 0);
        const delta = debitNormal ? debit - credit : credit - debit;
        running = Number((running + delta).toFixed(2)); // resets per account (within period)
        totalDebit = Number((totalDebit + debit).toFixed(2));
        totalCredit = Number((totalCredit + credit).toFixed(2));
        // Currency / exchange rate from the source document (when document-sourced).
        // Foreign docs carry amountForeign + sumAftDisWithVAT (ILS); rate = ILS/foreign.
        const amountForeign = Number(r.docAmountForeign ?? 0);
        const docSumWithVat = Number(r.docSumWithVat ?? 0);
        const exchangeRate = amountForeign > 0
          ? Number((docSumWithVat / amountForeign).toFixed(4))
          : 1;
        return {
          entryNumber: r.entryNumber != null ? Number(r.entryNumber) : 0,
          date: this.formatLedgerDate(r.date),
          valueDate: this.formatLedgerDate(r.valueDate),
          vatDate: this.formatLedgerDate(r.vatDate),
          vatReportingPeriod: r.vatReportingPeriod ?? '',
          allocationNum: r.allocationNum ?? '',
          notes: r.notes ?? '',
          referenceType: r.referenceType ?? '',
          referenceId: r.referenceId != null ? Number(r.referenceId) : 0,
          journalEntryId: Number(r.journalEntryId),
          description: this.buildLineDescription(ac, r.referenceType ?? null, r.subCategoryName ?? null),
          counterAccounts: r.counterAccounts != null
            ? `${nameByCode.get(r.counterAccounts) ?? r.counterAccounts} - ${r.counterAccounts}`
            : null,
          counterPartyName: r.counterPartyName ?? null,
          subCategoryName: r.subCategoryName ?? null,
          movementType: LEDGER_MOVEMENT_LABELS[r.referenceType] ?? (debit > 0 ? 'חובה' : 'זכות'),
          debit,
          credit,
          totalAmount: Math.max(debit, credit),
          currency: r.docCurrency ?? 'ILS',
          exchangeRate,
          amountBeforeVat: Number(r.amountBeforeVat ?? 0),
          amountForTax: Number(r.amountForTax ?? 0),
          vatAmount: Number(r.vatAmount ?? 0),
          taxPercent: Number(r.taxPercent ?? 100),
          vatPercent: Number(r.vatPercent ?? 100),
          documentTotal: r.documentTotal != null ? Number(r.documentTotal) : null,
          balance: running,
          periodBalance: Number((opening + running).toFixed(2)),
        };
      });
      const closingBalance = debitNormal
        ? Number((totalDebit - totalCredit).toFixed(2))
        : Number((totalCredit - totalDebit).toFixed(2));
      return {
        accountCode: ac,
        accountName: nameByCode.get(ac) ?? '',
        lines,
        totalDebit,
        totalCredit,
        closingBalance,
        openingBalance: opening,
        lineCount: lines.length,
      };
    });

    return { accounts };
  }

  /**
   * Returns all lines of a single journal entry, enriched with account names.
   * Scoped to firebaseId + businessNumber so a user can't read another user's data.
   */
  async getJournalEntryDetail(
    firebaseId: string,
    businessNumber: string,
    entryId: number,
  ): Promise<{
    entryNumber: number; date: string; valueDate: string; vatDate: string;
    referenceId: number; referenceType: string; description: string;
    counterPartyName: string | null;
    lines: { accountCode: string; accountName: string; debit: number; credit: number; description: string }[];
    totalDebit: number; totalCredit: number; isBalanced: boolean;
  }> {
    const entry = await this.JournalEntryRepo.findOne({
      where: { id: entryId, issuerBusinessNumber: businessNumber, firebaseId },
    });
    if (!entry) throw new NotFoundException(`Journal entry ${entryId} not found`);

    const rawLines = await this.JournalLineRepo.find({
      where: { journalEntryId: entryId },
      order: { lineInEntry: 'ASC' },
    });

    const chart = await this.defaultBookingAccountRepo.find();
    const nameByCode = new Map(chart.map((a) => [a.code, a.name]));

    const lines = rawLines.map((l) => ({
      accountCode: l.accountCode,
      accountName: nameByCode.get(l.accountCode) ?? l.accountCode,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      description: this.buildLineDescription(
        l.accountCode,
        entry.referenceType ? String(entry.referenceType) : null,
        l.subCategoryName ?? null,
      ),
    }));

    const totalDebit = Number(lines.reduce((s, l) => s + l.debit, 0).toFixed(2));
    const totalCredit = Number(lines.reduce((s, l) => s + l.credit, 0).toFixed(2));

    return {
      entryNumber: entry.entryNumber ?? 0,
      date: entry.date ?? '',
      valueDate: entry.valueDate ?? '',
      vatDate: entry.vatDate ?? '',
      referenceId: entry.referenceId ?? 0,
      referenceType: entry.referenceType ?? '',
      description: entry.description ?? '',
      counterPartyName: entry.counterPartyName ?? null,
      lines,
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  /** Full chart of accounts for the ledger FILTER dropdown, in display order.
   *  Includes technical accounts (2400/2410 VAT, 1000) so the ledger can be
   *  filtered to any account that may carry movements. */
  async getLedgerAccounts(): Promise<{ code: string; name: string; type: string }[]> {
    const chart = await this.defaultBookingAccountRepo.find();
    return chart
      .sort((a, b) => this.compareLedgerAccountCodes(a.code, b.code))
      .map((a) => ({ code: a.code, name: a.name, type: a.type }));
  }

  /** Posting accounts for the MANUAL JOURNAL ENTRY dropdown, in display order.
   *  Only accounts with a pnlCategory (income/expense) are returned; technical
   *  accounts (1000 A/R-contra, 2400/2410 VAT — pnlCategory NULL) are excluded
   *  so they can't be chosen for a manual journal line. */
  async getLedgerEntryAccounts(): Promise<{ code: string; name: string; type: string }[]> {
    const chart = await this.defaultBookingAccountRepo.find();
    return chart
      .filter((a) => !!a.pnlCategory)
      .sort((a, b) => this.compareLedgerAccountCodes(a.code, b.code))
      .map((a) => ({ code: a.code, name: a.name, type: a.type }));
  }

  /** Ledger account display order — all 25 accounts in the chart.
   *  Transfer/A/R/A/P accounts (1100–2100) are reserved for double-entry
   *  mode; in single-entry mode no lines are posted there so they never
   *  appear, but they are listed here so the ordering is stable if they do. */
  private compareLedgerAccountCodes(a: string, b: string): number {
    const order = [
      // מע"מ — ראשון (עסקאות ותשומות)
      '2400', '2410',
      // הכנסות
      '4000', '4010',
      // בנק וחשבונות מאזן
      '1100', '1110', '1120',
      // לקוחות כלליים
      '1200',
      // ספקים כלליים
      '2000', '2100',
      // technical
      '1000',
      // הוצאות
      '5000', '5100', '5200', '5300', '5400', '5500', '5600',
      '5700', '5800', '5900', '6000', '6100', '6200', '6300',
    ];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  }

  /** Normalize a DATE column value (driver may yield Date or string) to 'YYYY-MM-DD'. */
  private formatLedgerDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value ?? '').slice(0, 10);
  }

  /**
   * Compute the Hebrew "פירוט" (detail) text for a ledger line.
   * Priority: subCategoryName (expense lines) → account+referenceType lookup → fallback.
   */
  private buildLineDescription(
    accountCode: string,
    referenceType: string | null,
    subCategoryName: string | null,
  ): string {
    // 1. Expense account lines → sub-category name (e.g. "דלק", "ביטוח רכב")
    if (subCategoryName) return subCategoryName;

    const ref = referenceType ?? '';

    // 2. Input VAT line
    if (accountCode === '2410') return 'מע"מ תשומות בגין הוצאה';

    // 3. Output VAT line
    if (accountCode === '2400') {
      if (ref === 'CREDIT_INVOICE') return 'מע"מ עסקאות - חשבונית זיכוי';
      return 'מע"מ עסקאות בגין הכנסה';
    }

    // 4. Income accounts
    if (accountCode === '4000') {
      if (ref === 'TAX_INVOICE')         return 'חשבונית מס';
      if (ref === 'TAX_INVOICE_RECEIPT') return 'חשבונית מס קבלה';
      if (ref === 'CREDIT_INVOICE')      return 'חשבונית זיכוי';
      if (ref === 'RECEIPT')             return 'קבלה';
      return 'הכנסה';
    }
    if (accountCode === '4010') return 'הכנסה פטורה';

    // 5. Bank
    if (accountCode === '1100') {
      if (ref === 'EXPENSE')             return 'תשלום לספק';
      if (ref === 'TAX_INVOICE_RECEIPT') return 'קבלה מלקוח';
      if (ref === 'RECEIPT')             return 'קבלה מלקוח';
      if (ref === 'CREDIT_INVOICE')      return 'החזר ללקוח';
      if (ref === 'TAX_INVOICE')         return 'תשלום מלקוח';
      return 'תנועה בנקאית';
    }

    // 6. Customers A/R
    if (accountCode === '1200') {
      if (ref === 'CREDIT_INVOICE')      return 'זיכוי ללקוח';
      if (ref === 'RECEIPT')             return 'סגירת חוב לקוח';
      return 'חיוב לקוח';
    }

    // 7. Suppliers A/P
    if (accountCode === '2000') return 'חוב לספק';

    // 8. Fallback to Hebrew movement label
    return LEDGER_MOVEMENT_LABELS[ref] ?? 'תנועה';
  }

  private async getVatIncomeFromDocuments(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ vatableIncome: number; nonVatableIncome: number }> {
    const base = this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false')
      .andWhere('doc.docDate BETWEEN :start AND :end', { start: startDate, end: endDate });

    const vatable = await base.clone()
      .andWhere('doc.docType IN (:...types)', {
        types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT', 'CREDIT_INVOICE'],
      })
      .andWhere('doc.docVatRate > 0')
      .select(`COALESCE(SUM(
        CASE WHEN doc.docType = 'CREDIT_INVOICE'
             THEN -doc.sumAftDisBefVAT
             ELSE  doc.sumAftDisBefVAT
        END
      ), 0)`, 'total')
      .getRawOne<{ total: string }>();

    const nonVatable = await base.clone()
      .andWhere('doc.docType IN (:...types)', {
        types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT', 'CREDIT_INVOICE'],
      })
      .andWhere('doc.docVatRate = 0')
      .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
      .getRawOne<{ total: string }>();

    return {
      vatableIncome: Number(vatable?.total ?? 0),
      nonVatableIncome: Number(nonVatable?.total ?? 0),
    };
  }

  async getIncomeBeforeVat(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {

    const business = await this.businessRepo.findOne({
      where: { businessNumber },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // 2️⃣ Filter by business type
    const { businessType } = business;

    // Base condition for all businesses
    const baseQb = this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false');

    // 3️⃣ Logic by type
    if (isExemptBusinessType(businessType)) {
      // 🟢 Exempt (עוסק פטור / שותפות פטורה)
      // Income is based on RECEIPTs (sumAftDisBefVAT)
      const result = await baseQb
        .andWhere('doc.docType = :type', { type: 'RECEIPT' })
        .andWhere('doc.valueDate BETWEEN :start AND :end', {
          start: startDate,
          end: endDate,
        })
        .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
        .getRawOne<{ total: string }>();

      return Number(result.total);
    }

    // 🟣 Licensed / Company (עוסק מורשה / חברה)
    // Income before VAT = (TAX_INVOICE + TAX_INVOICE_RECEIPT + RECEIPT) - CREDIT_INVOICE
    const regularInvoices = await baseQb
      .andWhere('doc.docType IN (:...types)', {
        types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT', 'RECEIPT'],
      })
      .andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
      .getRawOne<{ total: string }>();

    const creditInvoices = await this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false')
      .andWhere('doc.docType = :type', { type: 'CREDIT_INVOICE' })
      .andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
      .getRawOne<{ total: string }>();

    const totalIncome =
      Number(regularInvoices.total) - Number(creditInvoices.total);

    return totalIncome;
  }
        


  /**
   * Form 1342 — equipment depreciation report for a single tax year.
   * Filters expenses by `isEquipment = true` for the requested business
   * and includes everything purchased on or before the selected tax year.
   */
  async createForm1342Report(
    firebaseId: string,
    businessNumber: string,
    year: number,
  ): Promise<Form1342ReportDto> {

    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const equipmentExpenses = await this.expenseRepo.find({
      where: {
        userId: firebaseId,
        businessNumber,
        isEquipment: true,
      },
      order: { date: 'ASC' },
    });

    const rows: Form1342ReportRowDto[] = [];

    for (const expense of equipmentExpenses) {
      // typeorm returns 'date' columns as Date OR string depending on driver
      const purchaseDate = expense.date instanceof Date
        ? expense.date
        : new Date(expense.date);

      // Exclude assets purchased after the selected tax year
      if (purchaseDate > yearEnd) continue;

      const purchaseYear = purchaseDate.getFullYear();
      const originalCost = Number(expense.sum) || 0;
      const depreciationRate = Number(expense.reductionPercent) || 0;
      const annualDepreciation = +(originalCost * (depreciationRate / 100)).toFixed(2);

      // Number of full years that have already passed before the selected year.
      // Asset purchased in 2022, selected year 2024 → prior years = 2 (2022, 2023).
      const fullPriorYears = Math.max(0, year - purchaseYear);

      // Cap accumulated prior-year depreciation at the original cost — an asset
      // can never depreciate more than it cost.
      const rawPrior = +(fullPriorYears * annualDepreciation).toFixed(2);
      const priorYearsDepreciation = Math.min(rawPrior, originalCost);

      // Current-year depreciation: full annual amount, but capped at the
      // remaining un-depreciated balance so total never exceeds original cost.
      const remainingBeforeCurrent = +(originalCost - priorYearsDepreciation).toFixed(2);
      const currentYearDepreciation = Math.min(annualDepreciation, remainingBeforeCurrent);

      const totalDepreciation = +(priorYearsDepreciation + currentYearDepreciation).toFixed(2);
      const remainingBalance = +(originalCost - totalDepreciation).toFixed(2);

      const purchaseIso = purchaseDate.toISOString().slice(0, 10);

      rows.push({
        assetName: expense.supplier ?? '',
        purchaseDate: purchaseIso,
        activationDate: purchaseIso,
        originalCost,
        changesDuringYear: 0,
        depreciationRate,
        depreciationRatePerLaw: depreciationRate,
        currentYearDepreciation,
        priorYearsDepreciation,
        totalDepreciation,
        remainingBalance,
      });
    }

    const totalOriginalCost = +rows.reduce((s, r) => s + r.originalCost, 0).toFixed(2);
    const totalCurrentYearDepreciation = +rows.reduce((s, r) => s + r.currentYearDepreciation, 0).toFixed(2);
    const totalPriorYearsDepreciation = +rows.reduce((s, r) => s + r.priorYearsDepreciation, 0).toFixed(2);
    const totalDepreciation = +rows.reduce((s, r) => s + r.totalDepreciation, 0).toFixed(2);
    const totalRemainingBalance = +rows.reduce((s, r) => s + r.remainingBalance, 0).toFixed(2);

    return {
      year,
      rows,
      totalOriginalCost,
      totalCurrentYearDepreciation,
      totalPriorYearsDepreciation,
      totalDepreciation,
      totalRemainingBalance,
    };
  }


    async createUniformFile(userId: string, startDate: string, endDate: string, businessNumber: string): Promise<{ filePath: string; zipBuffer: Buffer; document_summary: DocumentSummaryRow[]; list_summary: ListSummaryRow[] }> {

      // Reset recordSummary and totalLists to default values each time the user clicks "הצג"
      this.recordSummary = { A100: 1, B100: 0, B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 1 };
      this.totalLists = 0;

      // Generate Unique Random Number (15 digits)
      const uniqueId = this.generateUniqueId();
      
      const { content: dataContent, summary } = await this.generateDataFileContent(userId, businessNumber, startDate, endDate, uniqueId);

      // const zipFileName = `openformat.zip`;

      // Trim businessNumber to 8 digits if it has 9
      let trimBusinessNumber = businessNumber;
      if (businessNumber.length === 9) {
        trimBusinessNumber = businessNumber.substring(0, 8);
      }

      // Get current year suffix (XX)
      const currentYear = new Date().getFullYear();
      const XX = String(currentYear).slice(-2);

      // Create folder names
      const businessFolder = `${trimBusinessNumber}.${XX}`;
      const MMDDhhmm = this.getCurrentTimestamp();
      const filePath = `${businessFolder}/${MMDDhhmm}` 

      // Generate file contents
      const iniContent = await this.generateIniFileContent(businessNumber, uniqueId, filePath, startDate, endDate);

      const { document_summary, list_summary } = await this.buildUniformSummaries(businessNumber, startDate, endDate);

      return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];

        const iniBuffer = iconv.encode(iniContent, 'windows-1255');
        // archive.append(iniBuffer, { name: `OPENFRMT/${businessFolder}/${MMDDhhmm}/INI.TXT` });
        archive.append(iniBuffer, { name: `OPENFRMT/${filePath}/INI.TXT` });

        const dataBuffer = iconv.encode(dataContent, 'windows-1255');
        archive.append(dataBuffer, { name: `OPENFRMT/${filePath}/BKMVDATA.TXT` });        

        // Finalize ZIP file
        archive.finalize();
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => {
          const zipBuffer = Buffer.concat(chunks);
          resolve({ filePath: `OPENFRMT/${filePath}`, zipBuffer, document_summary, list_summary});
        });

        archive.on('error', (err) => reject(err));
      });
    }


    private async generateIniFileContent(businessNumber: string, uniqueId: string, filePath: string, startDate: string, endDate: string): Promise<string> {

      const startDateObj = this.sharedService.convertStringToDateObject(startDate);
      const endDateObj = this.sharedService.convertStringToDateObject(endDate);
      

      const currentDate = new Date();
      const formattedCurrentDate = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}`;

      let result = '';
    
      const f_1001 = this.formatField("!", 5, '!');
      const f_1002 = this.formatField(this.totalLists, 15, '0');
      const f_1003 = this.formatField(businessNumber, 9, '0');
      const f_1004 = this.formatField(uniqueId, 15, '0');
      const f_1005 = this.formatField("&OF1.31&", 8, '');
      const f_1006 = this.formatField("258001", 8, '0'); // מספר רישום התוכנה ברשות המיסים
      const f_1007 = this.formatField("KEEPINTAX", 20, '-');
      const f_1008 = this.formatField("version-001", 20, '-');
      const f_1009 = this.formatField("517134789", 9, "0"); // KEEPINTAX מספר עוסק של
      const f_1010 = this.formatField("KEEPINTAX", 20, '-');
      const f_1011 = this.formatField(2, 1, '0');
      const f_1012 = this.formatField(filePath, 50, '-');
      const f_1013 = this.formatField(1, 1, '0');
      const f_1014 = this.formatField(1, 1, '0');
      const f_1015 = this.formatField("517134789", 9, '0'); // מספר חברה ברשם החברות
      const f_1016 = this.formatField("000000000", 9, '0'); // מספר תיק ניכויים
      const f_1017 = this.formatField("!", 10, '!');
      const f_1018 = this.formatField("KEEPINTAX", 50, '-');
      const f_1019 = this.formatField("!", 50, '!');
      const f_1020 = this.formatField("!", 10, '!');
      const f_1021 = this.formatField("!", 30, '!');
      const f_1022 = this.formatField("!", 8, '!');
      const f_1023 = this.formatField("!", 4, '!');
      const f_1024 = this.formatField(this.formatDateYYYYMMDD(startDateObj), 8, '!');
      const f_1025 = this.formatField(this.formatDateYYYYMMDD(endDateObj), 8, '!');
      const f_1026 = this.formatField(formattedCurrentDate, 8, '!');
      const f_1027 = this.formatField(currentTime, 4, '!');
      const f_1028 = this.formatField(0, 1, '0');
      const f_1029 = this.formatField(1, 1, '0');
      const f_1030 = this.formatField("ZIP", 20, '!');
      const f_1032 = this.formatField("ILS", 3, '!');
      const f_1034 = this.formatField(0, 1, '0');
      const f_1035 = this.formatField("!", 46, '!');
      const c100 = `C100${this.formatField(this.recordSummary[`C100`], 15, '0')}`;
      const d110 = `D110${this.formatField(this.recordSummary[`D110`], 15, '0')}`;
      const d120 = `D120${this.formatField(this.recordSummary[`D120`], 15, '0')}`;
      const b100 = `B100${this.formatField(this.recordSummary[`B100`], 15, '0')}`;
      const b110 = `B110${this.formatField(this.recordSummary[`B110`], 15, '0')}`;
      const m100 = `M100${this.formatField(this.recordSummary[`M100`], 15, '0')}`;

      result +=`A000${f_1001}${f_1002}${f_1003}${f_1004}${f_1005}${f_1006}${f_1007}${f_1008}${f_1009}${f_1010}${f_1011}${f_1012}${f_1013}${f_1014}${f_1015}${f_1016}${f_1017}${f_1018}${f_1019}${f_1020}${f_1021}${f_1022}${f_1023}${f_1024}${f_1025}${f_1026}${f_1027}${f_1028}${f_1029}${f_1030}${f_1032}${f_1034}${f_1035}\n${c100}\n${d110}\n${d120}\n${b100}\n${b110}\n${m100}\n`;
     
      return result;
    }


    // Function to generate a 15-digit unique random number
    private generateUniqueId(): string {
      return Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    }


    // Function to get current timestamp for folder naming (MMDDhhmm)
    private getCurrentTimestamp(): string {
      const now = new Date();
      return `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }


    private async generateDataFileContent(userId: string, businessNumber: string, startDate: string, endDate: string, uniqueId: string): Promise<{ content: string; summary: any[] }> {

      let content = "";
      const allDocuments = await this.fetchDocuments(businessNumber, startDate, endDate);
      // Filter out doc types that don't participate in the uniform file
      // (e.g. PRICE_QUOTE — no code in UniformFileTypeCodeMap). Filtering here
      // keeps C100/D110/D120 consistent: a doc, its lines, and its payments
      // are all dropped together — no orphan D110/D120 rows.
      const documents = allDocuments.filter(
        (d) => d.docType != null && (d.docType as string) in UniformFileTypeCodeMap,
      );
      const journalEntries = await this.fetchJournalEntries(userId, businessNumber, startDate, endDate);
    
      // Add A100 section first
      content += this.generateA100Section(businessNumber, uniqueId);

      // Add C100 section
      const c100 = await this.generateC100Section(documents);
      this.recordSummary.C100 += (c100.match(/\n/g) || []).length;
      content += c100;

      // Add D110 section
      const d110 = await this.generateD110Section(documents);      
      this.recordSummary.D110 += (d110.match(/\n/g) || []).length;
      content += d110;

      // Add D120 section
      const d120 = await this.generateD120Section(documents);
      this.recordSummary.D120 += (d120.match(/\n/g) || []).length;
      content += d120;

      // Add B100 section
      const b100 = await this.generateB100Section(journalEntries);
      this.recordSummary.B100 += (b100.match(/\n/g) || []).length;
      content += b100;

      // Add B110 section
      const b110 = await this.generateB110Section(businessNumber);
      this.recordSummary.B110 += (b110.match(/\n/g) || []).length;
      content += b110;

       // Add M100 section
       const m100 = await this.generateM100Section(businessNumber);
       this.recordSummary.M100 += (m100.match(/\n/g) || []).length;
       content += m100;

      //Calculate total lists
      this.totalLists = Object.values(this.recordSummary).reduce((sum, val) => sum + val, 0);

      // Add Z900 section first
      content += this.generateZ900Section(businessNumber, uniqueId);
      
      return { 
        content, 
        summary: Object.keys(this.recordSummary).map((key) => ({
          code: key,
          description: this.getRecordDescription(key), // Add descriptions
          count: this.recordSummary[key]
        }))
      };

    }


    private generateA100Section(businessNumber: string, uniqueId: string): string {
      return `A100${this.getFormattedRecordCounter()}${businessNumber}${uniqueId}&OF1.31&${'!'.repeat(50)}\r\n`;
    }


    private async generateC100Section(documents: Documents[]): Promise<string> {

      let result = '';
      documents.forEach((doc) => {
        const f_1201 = this.getFormattedRecordCounter();
        const f_1202 = this.formatField(doc.issuerBusinessNumber, 9, '0');
        const f_1203 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
        const f_1204 = this.formatField(doc.docNumber, 20, '0');
        const f_1205 = this.formatField(this.formatDateYYYYMMDD(doc.issueDate), 8, '0');
        const f_1206 = this.formatField(doc.issueHour, 4, '0');
        const f_1207 = this.formatField(doc.recipientName, 50, '!');
        const f_1208 = this.formatField(doc.recipientStreet, 50, '!');
        const f_1209 = this.formatField(doc.recipientHomeNumber, 10, '!');
        const f_1210 = this.formatField(doc.recipientCity, 30, '!');
        const f_1211 = this.formatField(doc.recipientPostalCode, 8, '0');
        const f_1212 = this.formatField(doc.recipientState, 30, '!');
        const f_1213 = this.formatField(doc.recipientStateCode, 2, '!');
        const f_1214 = this.formatField(doc.recipientPhone, 15, '!');
        const f_1215 = this.formatField(doc.recipientId, 9, '0');
        const f_1216 = this.formatField(this.formatDateYYYYMMDD(doc.valueDate), 8, '!'); // תאריך ערך - לבדוק עם שריה
        const f_1217 = this.formatAmount(doc.amountForeign, 12, 2); // ימולא רק בחשבונית ייצוא - לבדוק עם שריה
        const f_1218 = this.formatField(doc.currency, 3, '!');
        const f_1219 = this.formatAmount(doc.sumBefDisBefVat, 12, 2);
        const f_1220 = this.formatAmount(doc.disSum, 12, 2);
        const f_1221 = this.formatAmount(doc.sumAftDisBefVAT, 12, 2);
        const f_1222 = this.formatAmount(doc.vatSum, 12, 2);
        const f_1223 = this.formatAmount(doc.sumAftDisWithVAT, 12, 2);
        const f_1224 = this.formatAmount(doc.withholdingTaxAmount, 9, 2);
        const f_1225 = this.formatField(doc.customerKey, 15, '!'); // מפתח לקוח - לבדוק עם שריה
        const f_1226 = this.formatField(doc.matchField, 10, '!'); // שדה התאמה - לבדוק עם שריה
        const f_1228 = this.formatField(doc.isCancelled ? '1' : '0', 1); // שדה התאמה - לבדוק עם שריה
        const f_1230 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
        const f_1231 = this.formatField(doc.branchCode, 7, '!');
        const f_1233 = this.formatField(doc.operationPerformer, 9, '!');
        const f_1234 = this.formatField(doc.generalDocIndex, 7, '0');
        const f_1235 = this.formatField("!", 13, '!');

        const debugMode = false; // Change to false for mission mode

        if (debugMode) {
          result += `C100\n\
          f_1201=${f_1201}\n\
          f_1202=${f_1202}\n\
          f_1203=${f_1203}\n\
          f_1204=${f_1204}\n\
          f_1205=${f_1205}\n\
          f_1206=${f_1206}\n\
          f_1207=${f_1207}\n\
          f_1208=${f_1208}\n\
          f_1209=${f_1209}\n\
          f_1210=${f_1210}\n\
          f_1211=${f_1211}\n\
          f_1212=${f_1212}\n\
          f_1213=${f_1213}\n\
          f_1214=${f_1214}\n\
          f_1215=${f_1215}\n\
          f_1216=${f_1216}\n\
          f_1217=${f_1217}\n\
          f_1218=${f_1218}\n\
          f_1219=${f_1219}\n\
          f_1220=${f_1220}\n\
          f_1221=${f_1221}\n\
          f_1222=${f_1222}\n\
          f_1223=${f_1223}\n\
          f_1224=${f_1224}\n\
          f_1225=${f_1225}\n\
          f_1226=${f_1226}\n\
          f_1228=${f_1228}\n\
          f_1230=${f_1230}\n\
          f_1231=${f_1231}\n\
          f_1233=${f_1233}\n\
          f_1234=${f_1234}\n\
          f_1235=${f_1235}\n`;
        } else {

          result += `C100${f_1201}${f_1202}${f_1203}${f_1204}${f_1205}${f_1206}${f_1207}${f_1208}${f_1209}${f_1210}${f_1211}${f_1212}${f_1213}${f_1214}${f_1215}${f_1216}${f_1217}${f_1218}${f_1219}${f_1220}${f_1221}${f_1222}${f_1223}${f_1224}${f_1225}${f_1226}${f_1228}${f_1230}${f_1231}${f_1233}${f_1234}${f_1235}\r\n`;
          
        }

      });
    
      return result;
    }


    private async generateD110Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerBusinessNumber: doc.issuerBusinessNumber,
            generalDocIndex: doc.generalDocIndex,
            docType: Not(DocumentType.RECEIPT),
          },
        });


    
        docLines.forEach((line) => {
          
          const f_1251 = this.getFormattedRecordCounter();
          const f_1252 = this.formatField(doc.issuerBusinessNumber, 9, '0');
          const f_1253 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
          const f_1254 = this.formatField(doc.docNumber, 20, '0');
          const f_1255 = this.formatField(line.lineNumber, 4, '0');
          const f_1256 = this.formatField(this.getDocumentTypeCode(doc.parentDocType, true), 3, '0');
          const f_1257 = this.formatField(doc.parentDocNumber, 20, '0');
          const f_1258 = this.formatField(line.transType, 1, '0');
          const f_1259 = this.formatField("175790433", 20, '0');
          const f_1260 = this.formatField(line.description, 30, '!');
          const f_1261 = this.formatField(line.manufacturerName, 50, '!');
          const f_1262 = this.formatField(line.productSerialNumber, 30, '!');
          const f_1263 = this.formatField(line.unitType, 20, '!');
          const f_1264 = this.formatAmount(line.unitQuantity, 12, 4);
          const f_1265 = this.formatAmount(line.sumBefVatPerUnit, 12, 2);
          const f_1266 = this.formatAmount(line.disBefVatPerLine, 12, 2);
          const f_1267 = this.formatAmount(line.sumAftDisBefVatPerLine, 12, 2);
          const f_1268 = this.formatAmount(line.vatRate, 2, 2, false);
          const f_1270 = this.formatField(doc.branchCode, 7, '0');
          const f_1272 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1273 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1274 = this.formatField("!", 7, '!');
          const f_1275 = this.formatField("!", 21, '!');

          result += `D110${f_1251}${f_1252}${f_1253}${f_1254}${f_1255}${f_1256}${f_1257}${f_1258}${f_1259}${f_1260}${f_1261}${f_1262}${f_1263}${f_1264}${f_1265}${f_1266}${f_1267}${f_1268}${f_1270}${f_1272}${f_1273}${f_1274}${f_1275}\r\n`;

        });
      }
    
      return result;
    }


    private async generateD120Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching payments lines for the current document
        const docPayments = await this.docPaymentsRepo.find({
          where: {
            issuerBusinessNumber: doc.issuerBusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        // Loop through the lines and create D120 records
        docPayments.forEach((line) => {
          const f_1301 = this.getFormattedRecordCounter(); // Running counter (9 digits)
          const f_1302 = this.formatField(doc.issuerBusinessNumber, 9, '0');
          const f_1303 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
          const f_1304 = this.formatField(doc.docNumber, 20, '0');
          const f_1305 = this.formatField(line.paymentLineNumber, 4, '0');
          const f_1306 = this.formatField(this.getPaymentCode(line.paymentMethod), 1, '0');
          const f_1307 = this.formatField(line.bankNumber, 10, '0');
          const f_1308 = this.formatField(line.branchNumber, 10, '0');
          const f_1309 = this.formatField(line.accountNumber, 15, '0');
          const f_1310 = this.formatField(line.checkNumber, 10, '0');
          const f_1311 = this.formatField(this.formatDateYYYYMMDD(line.paymentDate), 8, '0');;
          const f_1312 = this.formatAmount(line.paymentAmount, 12, 2);
          const f_1313 = this.formatField(line.cardCompany, 1, '0');
          const f_1314 = this.formatField(line.creditCardName, 20, '0');
          const f_1315 = this.formatField(line.creditTransType, 1, '0');
          const f_1320 = this.formatField(doc.branchCode, 7, '0');
          const f_1322 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1323 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1324 = this.formatField("!", 60, '!');

          result += `D120${f_1301}${f_1302}${f_1303}${f_1304}${f_1305}${f_1306}${f_1307}${f_1308}${f_1309}${f_1310}${f_1311}${f_1312}${f_1313}${f_1314}${f_1315}${f_1320}${f_1322}${f_1323}${f_1324}\r\n`;

        });
      }
    
      return result;
    }


    private async generateB100Section(entries: JournalEntry[]): Promise<string> {

      let result = '';

      for (const entry of entries) {

        const lines = await this.JournalLineRepo.find({
          where: {
            journalEntryId: entry.id,
            issuerBusinessNumber: entry.issuerBusinessNumber,
          }
        });
  
        lines.forEach((line) => {
          const f_1351 = this.getFormattedRecordCounter();
          const f_1352 = this.formatField(entry.issuerBusinessNumber, 9, '0');
          const f_1353 = this.formatField(entry.id, 10, '0');
          const f_1354 = this.formatField(line.lineInEntry, 5, '0');
          const f_1355 = this.formatField(entry.id, 8, '0');
          const f_1356 = this.formatField("!", 15, '!');
          const f_1357 = this.formatField(entry.referenceId, 20, '0');
          const f_1358 = this.formatField(this.getDocumentTypeCode(entry.referenceType, false), 3, '0');
          const f_1359 = this.formatField("0", 20, '0');
          const f_1360 = this.formatField("0", 3, '0');
          const f_1361 = this.formatField("!", 50, '!');
          const f_1362 = this.formatField(this.formatDateYYYYMMDD(entry.date), 8, '0');;
          const f_1363 = this.formatField(this.formatDateYYYYMMDD(entry.date), 8, '0');;
          const f_1364 = this.formatField(line.accountCode, 15, '!');
          const f_1365 = this.formatField("!", 15, '!');
          const f_1366 = this.formatField(line.debit > 0 ? '1' : '2', 1, '0');
          const f_1367 = this.formatField("!", 3, '!');
          const f_1368 = this.formatAmount(line.debit > 0 ? line.debit : line.credit, 12, 2);
          const f_1369 = this.formatAmount(0, 12, 2);
          const f_1370 = this.formatAmount(0, 9, 2);
          const f_1371 = this.formatField("!", 10, '!');
          const f_1372 = this.formatField("!", 10, '!');
          const f_1374 = this.formatField("!", 7, '!');
          const f_1375 = this.formatField(this.formatDateYYYYMMDD(entry.createdAt), 8, '0');
          const f_1376 = this.formatField("!", 9, '!');
          const f_1377 = this.formatField("!", 25, '!');

          result += `B100${f_1351}${f_1352}${f_1353}${f_1354}${f_1355}${f_1356}${f_1357}${f_1358}${f_1359}${f_1360}${f_1361}${f_1362}${f_1363}${f_1364}${f_1365}${f_1366}${f_1367}${f_1368}${f_1369}${f_1370}${f_1371}${f_1372}${f_1374}${f_1375}${f_1376}${f_1377}\r\n`;

        });
      }
    
      return result;
    }


    private async generateB110Section(businessNumber: string): Promise<string> {

      let result = '';

      const accounts = await this.defaultBookingAccountRepo.find();

      for (const account of accounts) {
  
        const f_1401 = this.getFormattedRecordCounter();
        const f_1402 = this.formatField(businessNumber, 9, '0');
        const f_1403 = this.formatField(account.code, 15, '!');
        const f_1404 = this.formatField(account.name, 50, '!');
        const f_1405 = this.formatField("!", 15, '!');
        const f_1406 = this.formatField("!", 30, '!');
        const f_1407 = this.formatField("!", 50, '!');
        const f_1408 = this.formatField("!", 10, '!');
        const f_1409 = this.formatField("!", 30, '!');
        const f_1410 = this.formatField("!", 8, '!');
        const f_1411 = this.formatField("!", 30, '!');
        const f_1412 = this.formatField("!", 2, '!');
        const f_1413 = this.formatField("!", 15, '!');
        const f_1414 = this.formatAmount(0, 12, 2);
        const f_1415 = this.formatAmount(0, 12, 2);
        const f_1416 = this.formatAmount(0, 12, 2);
        const f_1417 = this.formatField("0", 4, '0');
        const f_1419 = this.formatField("!", 9, '!');
        const f_1421 = this.formatField("!", 7, '!');
        const f_1422 = this.formatAmount(0, 12, 2);
        const f_1423 = this.formatField("!", 3, '!');
        const f_1424 = this.formatField("!", 16, '!');

        result += `B110${f_1401}${f_1402}${f_1403}${f_1404}${f_1405}${f_1406}${f_1407}${f_1408}${f_1409}${f_1410}${f_1411}${f_1412}${f_1413}${f_1414}${f_1415}${f_1416}${f_1417}${f_1419}${f_1421}${f_1422}${f_1423}${f_1424}\r\n`;

      }
    
      return result;
    }


    private async generateM100Section(businessNumber: string): Promise<string> {

      let result = '';
    
      const f_1451 = this.getFormattedRecordCounter();
      const f_1452 = this.formatField(businessNumber, 9, '0');
      const f_1453 = this.formatField("0", 20, '0');
      const f_1454 = this.formatField("0", 20, '0');
      const f_1455 = this.formatField("175790433", 20, '0');
      const f_1456 = this.formatField("!", 50, '!');
      const f_1457 = this.formatField("!", 10, '!');
      const f_1458 = this.formatField("!", 30, '!'); 
      const f_1459 = this.formatField("!", 20, '!');
      const f_1460 = this.formatAmount(0, 9, 2);
      const f_1461 = this.formatAmount(0, 9, 2);
      const f_1462 = this.formatAmount(0, 9, 2);
      const f_1463 = this.formatField("0", 10, '0');
      const f_1464 = this.formatField("0", 10, '0');
      const f_1465 = this.formatField("!", 50, '!');

      result += `M100${f_1451}${f_1452}${f_1453}${f_1454}${f_1455}${f_1456}${f_1457}${f_1458}${f_1459}${f_1460}${f_1461}${f_1462}${f_1463}${f_1464}${f_1465}\r\n`;
    
      return result;
    }
    

    private generateZ900Section(businessNumber: string, uniqueId: string): string {
      return `Z900${this.getFormattedRecordCounter()}${businessNumber}${uniqueId}&OF1.31&${this.formatField(this.totalLists, 15, '0')}${'?'.repeat(50)}\r\n`;
    }


    async buildDocumentSummary(
      businessNumber: string,
      startDate: string | Date,
      endDate: string | Date,
    ): Promise<DocumentSummaryRow[]> {

      // ✅ Convert string dates to Date objects if they're strings
      const startDateObj = typeof startDate === 'string' 
      ? this.sharedService.convertStringToDateObject(startDate) 
      : startDate;
      const endDateObj = typeof endDate === 'string' 
      ? this.sharedService.convertStringToDateObject(endDate) 
      : endDate;

      const rows = await this.documentsRepo
      .createQueryBuilder('d')
      .select('d.docType', 'docType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(d.sumAftDisWithVAT), 0)', 'totalSum')
      .where('d.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('d.docDate BETWEEN :from AND :to', { from: startDateObj, to: endDateObj }) // ✅ Use Date objects
      .groupBy('d.docType')
      .getRawMany<{ docType: DocumentType; count: string; totalSum: string }>();

      const summary: DocumentSummaryRow[] = rows
      .filter(row => DOC_TYPE_INFO[row.docType]) // only known types
      .map(row => {
        const { docNumber, docDescription } = DOC_TYPE_INFO[row.docType];
        return {
          docNumber,
          docDescription,
          totalDocs: Number(row.count),
          totalSum: parseFloat(row.totalSum),
        };
      });

      // compute grand totals
      const totalDocs = summary.reduce((sum, row) => sum + row.totalDocs, 0);
      const totalSum = summary.reduce((sum, row) => sum + row.totalSum, 0);

      // add the "total" row
      summary.push({
        docNumber: 'סה"כ' as any,  // force it since docNumber is typed as number
        docDescription: '',
        totalDocs,
        totalSum,
      });

      return summary;

    }


  async buildListSummary(): Promise<ListSummaryRow[]> {

    let list_summary: ListSummaryRow[] = [];

    list_summary = [
      { listNumber : "A100", listDescription: "רשומת פתיחה", listTotal: 1 },
      { listNumber : "B100", listDescription: "תנועות בהנהלת חשבונות", listTotal: this.recordSummary.B100 },
      { listNumber : "B110", listDescription: "חשבון בהנהלת חשבונות", listTotal: this.recordSummary.B110 },
      { listNumber : "C100", listDescription: "כותרת מסמך", listTotal: this.recordSummary.C100 },
      { listNumber : "D110", listDescription: "פרטי מסמך", listTotal: this.recordSummary.D110 },
      { listNumber : "D120", listDescription: "פרטי קבלות", listTotal: this.recordSummary.D120 },
      { listNumber : "M100", listDescription: "פריטים במלאי", listTotal: this.recordSummary.M100 },
      { listNumber : "Z900", listDescription: "רשומת סיום", listTotal: 1 },
    ];

    return list_summary;

  }

  async buildUniformSummaries(
    businessNumber: string,
    startDate: string | Date,
    endDate: string | Date,
  ): Promise<UniformSummaries> {
    const [document_summary, list_summary] = await Promise.all([
      this.buildDocumentSummary(businessNumber, startDate, endDate),
      this.buildListSummary(),
    ]);

    return { document_summary, list_summary };
  }


    private getRecordDescription(code: string): string {
      const descriptions: Record<string, string> = {
        A100: "רשומה פתיחה",
        B100: "תנועות בהנהלת חשבונות",
        B110: "חשבון בהנהלת חשבונות",
        C100: "כותרת מסמך",
        D110: "פרטי מסמך",
        D120: "פרטי קבלות",
        M100: "פריטים במלאי",
        Z900: "רשומת סיום"
      };
    
      return descriptions[code] || null;
    }


    // Format a field to a fixed length
    private formatField(value: string | number | Date, length: number, padChar: string = ' ', alignLeft: boolean = false): string {


      let strValue: string;

      if (value === null || value === undefined) {
        return padChar.repeat(length);
      }
  
      // Convert Date to YYYYMMDD format before processing
      if (value instanceof Date) {
          strValue = this.formatDateYYYYMMDD(value);
      } else {
          strValue = value.toString();
      }
  
      // Truncate if too long
      if (strValue.length > length) {
          return strValue.substring(0, length);
      }
  
      // Pad the value (left or right)
      return alignLeft ? strValue.padEnd(length, padChar) : strValue.padStart(length, padChar);
    }
  

    // Function to format the global recordCounter as 9 digits
    private getFormattedRecordCounter(): string {
      return String(this.recordCounter++).padStart(9, '0');
    }


    private formatAmount(value: number, intLength: number, decimalPlaces: number, withSign: boolean = true): string {
      const sign = value < 0 ? '-' : withSign ? '+' : '';
      const absValue = Math.abs(value);
    
      const [intPart, decPart] = absValue.toFixed(decimalPlaces).split('.');
    
      const paddedIntPart = intPart.padStart(intLength, '0');
      const paddedDecPart = decPart.padEnd(decimalPlaces, '0');
    
      return sign + paddedIntPart + paddedDecPart;
    }
    

    private getDocumentTypeCode(documentType: DocumentType | JournalReferenceType | null, allowNull: boolean): number | null {

      if (documentType === null) {
        if (allowNull) {
          return null;
        } else {
          throw new Error("Null document type is not allowed.");
        }
      }
        
      if (!(documentType in UniformFileTypeCodeMap)) {
        throw new Error(`Invalid document type: ${documentType}`);
      }
    
      return UniformFileTypeCodeMap[documentType];
    }
    

    private getPaymentCode(method: string): number {
      if ((method as keyof typeof PaymentMethodType) in PaymentMethodType) {
        return PaymentMethodType[method as keyof typeof PaymentMethodType];
      }
      return PaymentMethodType.OTHER;
    }


    // Format date to YYYYMMDD
    private formatDateYYYYMMDD(dateInput: Date | string): string {
      const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
      return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    }


    // Fetch documents by userId, businessNumber, startDate, and endDate
    async fetchDocuments(businessNumber: string, startDate: string, endDate: string): Promise<Documents[]> {

      const startDateObj = this.sharedService.convertStringToDateObject(startDate);
      const endDateObj = this.sharedService.convertStringToDateObject(endDate);
      
      return this.documentsRepo.find({
        where: {
          issuerBusinessNumber: businessNumber,
          docDate: Between(startDateObj, endDateObj),
        },
        order: { docDate: 'ASC' },
      });
    }

    
    async fetchJournalEntries(
      userId: string,
      issuerBusinessNumber: string,
      startDate: string,
      endDate: string
    ): Promise<JournalEntry[]> {
      return await this.JournalEntryRepo.find({
        where: {
          issuerBusinessNumber,
          date: Between(startDate, endDate),
        },
        order: {
          id: 'ASC',
        },
      });
    }
    


    async parseAndSaveDebugFile(fileName: string): Promise<string> {
      const inputFilePath = path.join(this.generatedFolder, fileName);
      const debugFilePath = path.join(this.debugFolder, fileName.replace('.TXT', '_DEBUG.TXT'));
  
      if (!fs.existsSync(inputFilePath)) {
        this.logger.error(`❌ File not found: ${inputFilePath}`);
        throw new Error(`File not found: ${fileName}`);
      }
  
      const fileStream = fs.createReadStream(inputFilePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
      const outputStream = fs.createWriteStream(debugFilePath);
      outputStream.write("====================================\n");
      outputStream.write("       DEBUG PARSED OUTPUT\n");
      outputStream.write("====================================\n\n");
  
      for await (const line of rl) {
        const fields = FIELD_MAP[line.substring(0, 4)]; // Get field definitions
      
        if (!fields) {
          this.logger.warn(`⚠ Unknown list type: ${line.substring(0, 4)}`);
          continue;
        }
      
        // Extract the first field (list name) and use it for the section title
        const firstField = fields[0]; // The first field is the list name
        const listName = line.substring(0, firstField.length).trim();
        outputStream.write(`==== ${listName} ====\n`);
      
        // Include the first field as the list type in the parsed output
        outputStream.write(`f_${firstField.field} = ${listName}      | ${firstField.description}\n`);
      
        // Start parsing from the second field onward
        let currentPosition = firstField.length;
        fields.slice(1).forEach(({ field, length, description }) => {
          const fieldValue = line.substring(currentPosition, currentPosition + length).trim();
          currentPosition += length;
          outputStream.write(`f_${field} = ${fieldValue}      | ${description}\n`);
        });
      
        outputStream.write("\n"); // Add a space between sections
      }
  
      outputStream.end();
      this.logger.log(`✅ Debug file created: ${debugFilePath}`);
      return debugFilePath;
    }


  async getDocsSummary(
    startDate: string,
    endDate: string,
    businessNumber: string,
  ): Promise<
    { docType: string; totalDocs: number; totalSum: number }[]
  > {
    return this.documentsRepo
      .createQueryBuilder('doc')
      .select('doc.docType', 'docType')
      .addSelect('COUNT(doc.id)', 'totalDocs')
      .addSelect('SUM(doc.sumAftDisWithVAT)', 'totalSum')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.docDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('doc.docType')
      .getRawMany();
  }

    
}