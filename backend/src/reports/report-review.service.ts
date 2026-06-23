import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, In } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { Expense } from '../expenses/expenses.entity';
import {
  ExtractedDocument,
  ExtractedDocStatus,
} from '../documents/extracted-document.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { Supplier } from '../expenses/suppliers.entity';
import { ExpensesService } from '../expenses/expenses.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentPairingService } from '../documents/document-pairing.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { SharedService } from '../shared/shared.service';
import { BusinessType, VATReportingType } from '../enum';
import { MatchingService } from './matching.service';
import {
  ReportPreviewResponse,
  ReviewDocSummary,
  ReviewRow,
  ReviewTxSummary,
} from './dtos/report-review.dto';

/**
 * Inline edits the user made in the review modal before clicking approve.
 * Every field is optional — anything left undefined falls back to the
 * source row's value (doc-side for matched/doc_only, slim-side for
 * tx_only). When `reportPeriod` is supplied we stamp it directly on the
 * resulting Expense.vatReportingDate instead of computing it from the
 * date + business cadence.
 */
export interface ReviewOverrides {
  category?: string;
  subCategory?: string;
  vatPercent?: number;
  taxPercent?: number;
  isEquipment?: boolean;
  /** "M/YYYY" or "M1-M2/YYYY" — overrides the auto-derived period label. */
  reportPeriod?: string;
  /** Per-row opt-out for the "register supplier in master list" auto-create
   *  inside addExpense. When undefined or true, the supplier (if it has a
   *  supplierID) is added to the Supplier table on first sight. The review
   *  modal toggles this by clicking the red flag icon next to the supplier
   *  name — useful for one-off vendors the user doesn't want polluting
   *  their master list. */
  saveAsSupplier?: boolean;
  /** Acknowledges a soft duplicate (same supplier/sum/date, different or
   *  missing document number). When true, addExpense saves despite the
   *  match instead of throwing DUPLICATE_WARNING. Set by the review modal
   *  after the user confirms "save anyway" on a flagged row. Never
   *  overrides the hard DUPLICATE_EXACT block. */
  acknowledgeDuplicate?: boolean;
}

/**
 * Owns the unified report-review pre-flight: the pipeline that runs before
 * the VAT or P&L report renders, gathering anything the user still needs
 * to decide (un-reviewed OCR'd documents + un-confirmed expense
 * transactions) into one modal.
 *
 * This service is intentionally separate from ReportsService — which is
 * about *generating* reports — so the pre-flight surface can grow without
 * tangling with the heavier report-generation code paths.
 */
@Injectable()
export class ReportReviewService {
  private readonly logger = new Logger(ReportReviewService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ExtractedDocument)
    private readonly docRepo: Repository<ExtractedDocument>,
    @InjectRepository(SlimTransaction)
    private readonly slimRepo: Repository<SlimTransaction>,
    @InjectRepository(FullTransactionCache)
    private readonly cacheRepo: Repository<FullTransactionCache>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly expensesService: ExpensesService,
    private readonly sharedService: SharedService,
    private readonly matchingService: MatchingService,
    // DocumentsService imports UsersService which lives in a different module
    // graph; forwardRef avoids a circular DI error at boot.
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
    private readonly documentPairingService: DocumentPairingService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly dataSource: DataSource,
  ) {}

  // ====================================================================
  // PREVIEW
  // ====================================================================

  /**
   * The endpoint behind GET /reports/me/preview.
   *
   *   1. Process any new files in Drive `inbox/` (best-effort per file).
   *   2. If the user has Open Banking → run the auto-matcher over the
   *      period.
   *   3. Build the discriminated union of review rows. Documents are
   *      scoped to "all pending_review for this business" (no date
   *      filter — legacy docs from outside the period still need a
   *      decision); transactions are scoped to the requested period.
   *   4. Counts in the response drive the modal subtitle.
   */
  /**
   * Cheap pre-flight: does this user have ANYTHING worth reviewing for
   * this business right now? Two signals:
   *   - `hasPendingDocs`        — EITHER (a) files sitting in Drive inbox/
   *     that haven't been OCR'd yet, OR (b) extracted_document rows already
   *     OCR'd but still in status=PENDING_REVIEW (i.e. surfaced in a prior
   *     review modal that the user closed without resolving). Either case
   *     means "the user has docs to triage".
   *   - `hasUnconfirmedExpenses` — slim transactions that the user already
   *     classified (isRecognized=true) but hasn't yet confirmed as Expense.
   *
   * Used by the report-page submit flow to decide whether to open the
   * full review modal — both false → skip straight to the report data
   * load. Skips Open-Banking-only users' second signal when
   * `hasOpenBanking=false`.
   *
   * Intentionally CHEAP — no OCR, no matcher — just a folder listing
   * and two `SELECT 1`s. Sub-second so it's free to call on every submit.
   */
  async previewCheck(
    firebaseId: string,
    businessNumber: string,
  ): Promise<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }> {
    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) throw new NotFoundException(`User not found for firebaseId`);

    let hasPendingDocs = false;

    // Already-OCR'd-but-pending docs: keyed by businessNumber so the
    // check survives Firebase user re-creations (testReset etc.). This
    // catches the "user skipped the modal without approving anything"
    // case where inbox is empty (files moved to processed/) but rows
    // still need a decision.
    const pendingDocsCount = await this.docRepo
      .createQueryBuilder('d')
      .where('d.businessNumber = :bn', { bn: businessNumber })
      .andWhere('d.status = :st', { st: ExtractedDocStatus.PENDING_REVIEW })
      .getCount();
    if (pendingDocsCount > 0) {
      hasPendingDocs = true;
    } else {
      // Only hit Drive when the DB came up empty — sub-second either way
      // but the API call has a small latency, so short-circuit when we
      // already know there's work.
      try {
        const business = await this.businessRepo.findOne({
          where: { firebaseId, businessNumber },
        });
        const inboxFolderId = business?.driveInboxFolderId;
        if (inboxFolderId) {
          const files = await this.googleDriveService.listFolderFiles(inboxFolderId);
          hasPendingDocs = files.length > 0;
        }
      } catch (err: any) {
        this.logger.warn(
          `previewCheck: inbox listing failed for biz=${businessNumber}: ${err?.message ?? err}`,
        );
      }
    }

    // Unconfirmed-expense check: only meaningful when Open Banking is on
    // (otherwise no slim rows ever exist for the user).
    let hasUnconfirmedExpenses = false;
    if (user.hasOpenBanking) {
      const count = await this.slimRepo
        .createQueryBuilder('slim')
        .where('slim.businessNumber = :bn', { bn: businessNumber })
        .andWhere('slim.isRecognized = true')
        .andWhere('slim.confirmed = false')
        .getCount();
      hasUnconfirmedExpenses = count > 0;
    }

    return { hasPendingDocs, hasUnconfirmedExpenses };
  }

  async getReportPreview(
    firebaseId: string,
    businessNumber: string,
    range: { from: Date; to: Date },
  ): Promise<ReportPreviewResponse> {
    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) throw new NotFoundException(`User not found for firebaseId`);

    // Step 1 — pull anything new from inbox/. Failures here don't sink the
    // preview; the inbox processor logs per-file errors and the user can
    // retry next time. Wrapping the whole preview in a try would mask
    // genuine bugs in matching / row assembly, so we let processInboxForUser
    // surface its own errors but tolerate them.
    // Count of byte-identical re-uploads the inbox loop auto-rejected this
    // pass — surfaced to the user as a non-blocking notice (the rows never
    // enter the review table; they're skipped before OCR).
    let duplicatesSkipped = 0;
    try {
      const inboxResult = await this.documentsService.processInboxForUser(firebaseId, businessNumber);
      duplicatesSkipped = inboxResult?.duplicates ?? 0;
    } catch (err: any) {
      this.logger.warn(
        `getReportPreview step 1 (processInboxForUser) failed for biz=${businessNumber}: ${err?.message ?? err}`,
      );
    }

    // Step 1.5 — pair invoices↔receipts that describe the same purchase.
    // Runs BEFORE the matcher so a paired row (one combined receipt with
    // documentType=invoice_receipt_pair) competes for the bank transaction
    // as a single candidate, not as two siblings fighting each other.
    // Best-effort: a pairing failure shows up as extra unpaired doc_only
    // rows, which the user can still link manually.
    try {
      if (user.index != null) {
        await this.documentPairingService
          .pairInvoicesAndReceiptsForBusiness(user.index, businessNumber);
      }
    } catch (err: any) {
      this.logger.warn(
        `getReportPreview step 1.5 (pairing) failed for biz=${businessNumber}: ${err?.message ?? err}`,
      );
    }

    // Step 2 — decide mode + (if Open Banking is on) run the matcher.
    const mode: ReportPreviewResponse['mode'] = user.hasOpenBanking
      ? 'with_banking'
      : 'documents_only';

    if (mode === 'with_banking') {
      try {
        await this.matchingService.matchDocumentsForBusiness(
          firebaseId,
          businessNumber,
          range,
        );
      } catch (err: any) {
        this.logger.warn(
          `getReportPreview step 2 (matcher) failed for biz=${businessNumber}: ${err?.message ?? err}`,
        );
      }
    }

    // Step 3 — load review rows.
    // Date scope: include docs dated on or before the period end. Docs
    // with no OCR'd date stay visible (the user still needs to triage
    // them); docs AFTER the period end are hidden (they belong to a
    // later report). Lower bound intentionally omitted so late-arriving
    // docs from prior periods still surface.
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .where('d.userId = :uid', { uid: user.index })
      .andWhere('d.businessNumber = :bn', { bn: businessNumber })
      .andWhere('d.status = :st', { st: ExtractedDocStatus.PENDING_REVIEW })
      .andWhere('(d.date IS NULL OR d.date <= :to)', { to: range.to })
      .orderBy('d.date', 'ASC')
      .addOrderBy('d.id', 'ASC')
      .getMany();

    // For with_banking mode, also pull eligible slim transactions in the
    // window. `isRecognized && !confirmed` is the existing definition of
    // "classified as expense but not yet committed to expense table".
    const txCacheRows =
      mode === 'with_banking'
        ? await this.loadTransactionsInRange(firebaseId, businessNumber, range)
        : [];

    // Pre-compute the set of supplierIDs already in the user's Supplier
    // table — drives the "ספק מוכר / ספק חדש" column. One batched IN query
    // beats N per-doc lookups during row assembly.
    const docSupplierIds = Array.from(new Set(
      docs.map(d => d.supplierId?.trim()).filter((v): v is string => !!v),
    ));
    const knownSuppliers = docSupplierIds.length
      ? await this.supplierRepo.find({
          where: { userId: firebaseId, supplierID: In(docSupplierIds) },
        })
      : [];
    // Index by supplierID so toDocSummary can both flag a known supplier
    // AND hydrate the row's classification (category/sub/vat/tax/isEquipment)
    // from the user's saved master record. The saved supplier is the
    // authoritative classification for that vendor — it wins over whatever
    // the OCR guessed on this particular invoice.
    const knownSupplierById = new Map<string, Supplier>();
    for (const s of knownSuppliers) {
      const key = s.supplierID?.trim();
      if (key) knownSupplierById.set(key, s);
    }

    // Step 4 — assemble rows.
    const matchedDocIds = new Set<number>();
    const matchedTxIds = new Set<number>();
    const rows: ReviewRow[] = [];

    // Index transactions by slim id for the matched-row join.
    const txBySlimId = new Map<number, { slim: SlimTransaction; cache: FullTransactionCache }>();
    for (const r of txCacheRows) txBySlimId.set(r.slim.id, r);

    // First pass: matched rows. Linkage is symmetric (doc.matchedTransactionId
    // ↔ slim.matchedDocumentId), so iterating docs is sufficient.
    for (const doc of docs) {
      if (!doc.matchedTransactionId) continue;
      const tx = txBySlimId.get(doc.matchedTransactionId);
      if (!tx) continue;
      rows.push({
        type: 'matched',
        document: this.toDocSummary(doc, knownSupplierById),
        transaction: this.toTxSummary(tx.slim, tx.cache),
      });
      matchedDocIds.add(doc.id);
      matchedTxIds.add(doc.matchedTransactionId);
    }

    // Second pass: doc_only — every pending doc not consumed above.
    for (const doc of docs) {
      if (matchedDocIds.has(doc.id)) continue;
      rows.push({ type: 'doc_only', document: this.toDocSummary(doc, knownSupplierById) });
    }

    // Third pass: tx_only — every eligible tx not consumed above (only in
    // with_banking mode; documents_only never sees transactions).
    if (mode === 'with_banking') {
      for (const { slim, cache } of txCacheRows) {
        if (matchedTxIds.has(slim.id)) continue;
        rows.push({ type: 'tx_only', transaction: this.toTxSummary(slim, cache) });
      }
    }

    return {
      mode,
      rows,
      counts: {
        matched: rows.filter(r => r.type === 'matched').length,
        docOnly: rows.filter(r => r.type === 'doc_only').length,
        txOnly: rows.filter(r => r.type === 'tx_only').length,
      },
      duplicatesSkipped,
    };
  }

  // ====================================================================
  // APPROVE — "matched" row (document + transaction)
  // ====================================================================

  /**
   * One DB transaction:
   *   1. Create the Expense via the existing addExpense pipeline (handles
   *      VAT/tax math, FX conversion, isEquipment resolution).
   *   2. Stamp source_document_id + externalTransactionId on the new
   *      Expense (provenance).
   *   3. Flip extracted_document.status → approved + record
   *      confirmed_expense_id.
   *   4. Flip slim_transaction.confirmed = true + stamp vatReportingDate.
   *
   * If any step throws, the transaction rolls back — partial state would
   * leave us with an Expense whose source rows still show as pending,
   * which the review modal would re-surface on the next preview.
   */
  async approveMatched(
    firebaseId: string,
    businessNumber: string,
    documentId: number,
    slimTransactionId: number,
    overrides: ReviewOverrides = {},
  ): Promise<{ expenseId: number }> {
    const { doc, slim, cache } = await this.loadMatchedPair(
      firebaseId,
      businessNumber,
      documentId,
      slimTransactionId,
    );

    // Resolve final values: override > doc > slim. Doc wins over slim
    // because matched rows are anchored on the document (it's the source
    // for VAT-deduction evidence); slim is the bank-side classification.
    const finalCategory    = overrides.category    ?? doc.category    ?? slim.category;
    const finalSubCategory = overrides.subCategory ?? doc.subCategory ?? slim.subCategory;
    const finalVatPercent  = Number(overrides.vatPercent ?? doc.vatPercent ?? slim.vatPercent);
    const finalTaxPercent  = Number(overrides.taxPercent ?? doc.taxPercent ?? slim.taxPercent);
    const finalEquipment   = overrides.isEquipment ?? !!(doc.isEquipment ?? slim.isEquipment);

    // Non-ILS docs go through addExpense's FX conversion path; ILS docs
    // pass their amount as `sum` directly. For matched rows we still
    // prefer the document-side amount (it's the OCR'd invoice total) and
    // only fall back to the cache's ILS amount when the doc had no
    // amount at all.
    const amounts = doc.amount != null
      ? this.buildExpenseAmountFromDoc(doc)
      : { sum: this.absIls(cache), originalCurrency: null, originalSum: null };

    return this.dataSource.transaction(async manager => {
      const expense = await this.expensesService.addExpense(
        {
          supplier: doc.supplier ?? cache.merchantName,
          supplierID: doc.supplierId ?? '',
          // expenseNumber is misnamed — it carries the invoice number from
          // the OCR'd document, NOT a separate user-entered reference. Pass
          // through whatever the OCR captured; null when the doc has no
          // printed number (rare for invoices, common for cash receipts).
          expenseNumber: doc.invoiceNumber ?? undefined as any,
          category: finalCategory,
          subCategory: finalSubCategory,
          sum: amounts.sum,
          taxPercent: finalTaxPercent,
          vatPercent: finalVatPercent,
          acknowledgeDuplicate: overrides.acknowledgeDuplicate ?? false,
          date: doc.date ? (new Date(doc.date) as any) : (cache.transactionDate as any),
          note: undefined as any,
          file: undefined as any,
          reductionPercent: 0,
          isEquipment: finalEquipment,
          originalCurrency: amounts.originalCurrency as any,
          originalSum: amounts.originalSum as any,
          ...({
            externalTransactionId: slim.externalTransactionId,
          } as any),
        } as any,
        firebaseId,
        businessNumber,
        overrides.saveAsSupplier ?? true,
      );

      // Resolve the VAT report period once and stamp it on BOTH the Expense
      // and the slim transaction so neither side is left with a NULL period.
      // The bookkeeping table's period column and the period-stamped report
      // queries both rely on expense.vatReportingDate — and addExpense does
      // NOT compute it, so without this the Expense would carry NULL and fall
      // back to date-only filtering. User override wins; otherwise derive
      // from the business cadence. The Expense uses its own date (the doc
      // date when present); the slim keeps the bank-transaction date.
      const business = await this.businessRepo.findOne({
        where: { firebaseId, businessNumber },
      });
      const businessType = business?.businessType ?? BusinessType.LICENSED;
      const vatReportingType = business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;
      const expensePeriod = overrides.reportPeriod
        ?? this.sharedService.buildReportPeriodLabel(
          businessType,
          vatReportingType,
          // doc.date / cache.transactionDate are typed Date but TypeORM may
          // hand them back as strings for MySQL DATE columns depending on
          // driver version. Wrap unconditionally — `new Date(Date)` clones.
          doc.date ? new Date(doc.date) : new Date(cache.transactionDate as any),
        );

      // Stamp document-side provenance + the resolved period on the fresh
      // Expense. The period is ALWAYS written now (not only on override).
      // pnlCategory is intentionally left NULL — it's an override-only slot
      // resolved live (expense.pnlCategory ?? subcategory map ?? category) by
      // both the P&L report and the bookkeeping display, so storing it here
      // would only freeze a value that should track the live mapping.
      await manager.getRepository(Expense).update(
        { id: expense.id },
        { sourceDocumentId: doc.id, vatReportingDate: expensePeriod as any },
      );

      await manager.getRepository(ExtractedDocument).update(
        { id: doc.id },
        {
          status: ExtractedDocStatus.APPROVED,
          confirmedExpenseId: expense.id,
        },
      );

      // Cascade approval to the paired invoice (if any). The receipt is
      // the primary in a pair; approving it covers both halves of the
      // expense, so the invoice should follow into APPROVED rather than
      // staying in PAIRED (which would re-surface if someone unpaired).
      if (doc.pairedWithDocumentId) {
        await manager.getRepository(ExtractedDocument).update(
          { id: doc.pairedWithDocumentId },
          { status: ExtractedDocStatus.APPROVED, confirmedExpenseId: expense.id },
        );
      }

      // Slim-side period: override wins, otherwise derive from the bank
      // transaction date (kept separate from the Expense date above).
      const slimPeriod = overrides.reportPeriod
        ?? this.sharedService.buildReportPeriodLabel(
          businessType,
          vatReportingType,
          new Date(cache.transactionDate as any),
        );
      await manager.getRepository(SlimTransaction).update(
        { id: slim.id },
        { confirmed: true, vatReportingDate: slimPeriod as any },
      );

      this.logger.log(
        `approveMatched: doc=${doc.id} + tx=${slim.id} → expense=${expense.id} (biz=${businessNumber})`,
      );
      return { expenseId: expense.id };
    });
  }

  // ====================================================================
  // APPROVE — "doc_only" row (cash receipt, no transaction)
  // ====================================================================

  async approveDocCash(
    firebaseId: string,
    businessNumber: string,
    documentId: number,
    overrides: ReviewOverrides = {},
  ): Promise<{ expenseId: number }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    await this.assertDocOwnership(doc, firebaseId, businessNumber);
    if (doc.status !== ExtractedDocStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Document ${documentId} is not pending_review (status=${doc.status})`,
      );
    }

    const finalCategory    = overrides.category    ?? doc.category    ?? '';
    const finalSubCategory = overrides.subCategory ?? doc.subCategory ?? '';
    const finalVatPercent  = Number(overrides.vatPercent ?? doc.vatPercent ?? 0);
    const finalTaxPercent  = Number(overrides.taxPercent ?? doc.taxPercent ?? 0);
    const finalEquipment   = overrides.isEquipment ?? !!doc.isEquipment;

    const amounts = this.buildExpenseAmountFromDoc(doc);

    return this.dataSource.transaction(async manager => {
      const expense = await this.expensesService.addExpense(
        {
          supplier: doc.supplier ?? '',
          supplierID: doc.supplierId ?? '',
          // expenseNumber is misnamed — it carries the invoice number from
          // the OCR'd document, NOT a separate user-entered reference. Pass
          // through whatever the OCR captured; null when the doc has no
          // printed number (rare for invoices, common for cash receipts).
          expenseNumber: doc.invoiceNumber ?? undefined as any,
          category: finalCategory,
          subCategory: finalSubCategory,
          sum: amounts.sum,
          taxPercent: finalTaxPercent,
          vatPercent: finalVatPercent,
          acknowledgeDuplicate: overrides.acknowledgeDuplicate ?? false,
          date: doc.date ? (new Date(doc.date) as any) : (new Date() as any),
          note: undefined as any,
          file: undefined as any,
          reductionPercent: 0,
          isEquipment: finalEquipment,
          originalCurrency: amounts.originalCurrency as any,
          originalSum: amounts.originalSum as any,
        } as any,
        firebaseId,
        businessNumber,
        overrides.saveAsSupplier ?? true,
      );

      // Resolve + stamp the VAT report period on the Expense — ALWAYS, not
      // just on override. addExpense doesn't compute it, so without this the
      // row would carry a NULL vatReportingDate. User override wins; else
      // derive from the business cadence + the document date.
      const business = await this.businessRepo.findOne({
        where: { firebaseId, businessNumber },
      });
      const reportPeriod = overrides.reportPeriod
        ?? this.sharedService.buildReportPeriodLabel(
          business?.businessType ?? BusinessType.LICENSED,
          business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT,
          // doc.date may come back as a string from MySQL DATE — wrap it.
          doc.date ? new Date(doc.date) : new Date(),
        );

      // pnlCategory left NULL — override-only, resolved live downstream.
      await manager.getRepository(Expense).update(
        { id: expense.id },
        { sourceDocumentId: doc.id, vatReportingDate: reportPeriod as any },
      );

      await manager.getRepository(ExtractedDocument).update(
        { id: doc.id },
        {
          status: ExtractedDocStatus.APPROVED,
          confirmedExpenseId: expense.id,
        },
      );

      // Cascade approval to the paired invoice (see approveMatched for
      // the same logic + rationale).
      if (doc.pairedWithDocumentId) {
        await manager.getRepository(ExtractedDocument).update(
          { id: doc.pairedWithDocumentId },
          { status: ExtractedDocStatus.APPROVED, confirmedExpenseId: expense.id },
        );
      }

      this.logger.log(
        `approveDocCash: doc=${doc.id} → expense=${expense.id} (biz=${businessNumber})`,
      );
      return { expenseId: expense.id };
    });
  }

  // ====================================================================
  // APPROVE — "tx_only" row (transaction without a document)
  // ====================================================================

  /**
   * User says "this transaction is a real expense, I don't have or need a
   * document for it" (typical for small CC charges, recurring debits).
   * We use the category/sub_category/vat/tax already on the slim_transaction
   * — those were set at classification time — so no inline picker UI is
   * needed in the review modal.
   */
  async approveTxNoDoc(
    firebaseId: string,
    businessNumber: string,
    slimTransactionId: number,
    overrides: ReviewOverrides = {},
  ): Promise<{ expenseId: number }> {
    const { slim, cache } = await this.loadTxPair(firebaseId, businessNumber, slimTransactionId);

    const finalCategory    = overrides.category    ?? slim.category;
    const finalSubCategory = overrides.subCategory ?? slim.subCategory;
    const finalVatPercent  = Number(overrides.vatPercent ?? slim.vatPercent);
    const finalTaxPercent  = Number(overrides.taxPercent ?? slim.taxPercent);
    const finalEquipment   = overrides.isEquipment ?? !!slim.isEquipment;

    return this.dataSource.transaction(async manager => {
      const expense = await this.expensesService.addExpense(
        {
          supplier: cache.merchantName,
          supplierID: '',
          expenseNumber: undefined as any,
          category: finalCategory,
          subCategory: finalSubCategory,
          sum: this.absIls(cache),
          taxPercent: finalTaxPercent,
          vatPercent: finalVatPercent,
          acknowledgeDuplicate: overrides.acknowledgeDuplicate ?? false,
          date: cache.transactionDate as any,
          note: undefined as any,
          file: undefined as any,
          reductionPercent: slim.reductionPercent ?? 0,
          isEquipment: finalEquipment,
          ...({
            externalTransactionId: slim.externalTransactionId,
          } as any),
        } as any,
        firebaseId,
        businessNumber,
        overrides.saveAsSupplier ?? true,
      );

      // Resolve the VAT report period once and stamp it on BOTH the Expense
      // and the slim transaction. tx_only rows share the bank-transaction
      // date, so one period covers both. ALWAYS written (not just on
      // override) — addExpense doesn't compute the Expense period.
      const business = await this.businessRepo.findOne({
        where: { firebaseId, businessNumber },
      });
      const reportPeriod = overrides.reportPeriod
        ?? this.sharedService.buildReportPeriodLabel(
          business?.businessType ?? BusinessType.LICENSED,
          business?.vatReportingType ?? VATReportingType.MONTHLY_REPORT,
          // cache.transactionDate is typed Date but TypeORM may hand it
          // back as a string for MySQL DATE columns depending on driver
          // version. Wrap unconditionally — `new Date(Date)` clones safely.
          new Date(cache.transactionDate as any),
        );

      // pnlCategory left NULL — override-only, resolved live downstream.
      await manager.getRepository(Expense).update(
        { id: expense.id },
        { vatReportingDate: reportPeriod as any },
      );
      await manager.getRepository(SlimTransaction).update(
        { id: slim.id },
        { confirmed: true, vatReportingDate: reportPeriod as any },
      );

      this.logger.log(
        `approveTxNoDoc: tx=${slim.id} → expense=${expense.id} (biz=${businessNumber})`,
      );
      return { expenseId: expense.id };
    });
  }

  // ====================================================================
  // LINK — manual pair from a tx_only row
  // ====================================================================

  /** Symmetric writeback through MatchingService; we just verify the user
   *  owns both sides before delegating. */
  async linkDocToTx(
    firebaseId: string,
    businessNumber: string,
    documentId: number,
    slimTransactionId: number,
  ): Promise<{ ok: true }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    await this.assertDocOwnership(doc, firebaseId, businessNumber);
    await this.linkOwnershipCheckTx(firebaseId, businessNumber, slimTransactionId);

    await this.matchingService.linkDocToTx(
      firebaseId,
      businessNumber,
      documentId,
      slimTransactionId,
    );
    return { ok: true };
  }

  // ====================================================================
  // ARCHIVE — delegate to the existing per-row archive in DocumentsService
  // ====================================================================

  archiveDoc(
    firebaseId: string,
    documentId: number,
  ): Promise<{ ok: true; documentId: number; movedFile: boolean }> {
    return this.documentsService.archiveDocument(firebaseId, documentId);
  }

  // ====================================================================
  // UNPAIR — "פצל" on an invoice_receipt_pair row
  // ====================================================================

  /**
   * Reverse a pair set by DocumentPairingService. Receipt reverts to
   * documentType=RECEIPT, invoice reverts to status=PENDING_REVIEW; both
   * back-pointers cleared. Either side of the pair can be the entry
   * point — the service follows the back-pointer to find the partner.
   *
   * Defensive: refuses to unpair if either half is APPROVED (the receipt
   * has already become an Expense's sourceDocumentId; un-pairing would
   * orphan the invoice and confuse audit trails). User would have to
   * reverse the Expense first.
   */
  async unpair(
    firebaseId: string,
    documentId: number,
  ): Promise<{ ok: true }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    await this.assertDocOwnership(doc, firebaseId, doc.businessNumber ?? '');
    if (!doc.pairedWithDocumentId) {
      throw new BadRequestException(`Document ${documentId} is not paired`);
    }
    if (doc.status === ExtractedDocStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot unpair an APPROVED row — reverse the Expense first`,
      );
    }
    const partner = await this.docRepo.findOne({
      where: { id: doc.pairedWithDocumentId },
    });
    if (partner?.status === ExtractedDocStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot unpair: partner row is APPROVED — reverse the Expense first`,
      );
    }
    await this.documentPairingService.unpair(documentId);
    return { ok: true };
  }

  // ====================================================================
  // UPLOAD + LINK — "העלה מסמך" on a tx_only row
  // ====================================================================

  /**
   * User picked a PDF/image off their machine and wants to OCR it as the
   * source doc for a pending bank transaction. End-to-end:
   *   1. Validate the slim transaction belongs to the caller's business
   *      AND isn't already linked to a doc (defensive — prevents double-
   *      linking when the user double-clicks the upload button).
   *   2. Hand the file to DocumentsService.uploadAndOcrDoc, which uploads
   *      to Drive inbox/, runs Claude, persists one extracted_document
   *      row per invoice, and returns the FIRST row.
   *   3. linkDocToTx that first row to the slim — symmetric pointers so
   *      the next preview pass surfaces it as a `matched` row.
   *
   * Multi-invoice PDFs are common (monthly fuel statements, bundled
   * receipts). We link only sub_index=0 here — the siblings appear as
   * fresh doc_only rows on the next preview and the user can resolve
   * each one separately (link / approve / archive / reject). If we tried
   * to auto-match each sibling here, we'd be doing matcher-class work
   * (date/amount tolerance over all unmatched slim rows for the user)
   * inline behind a single user click, which doesn't pay off versus
   * letting the regular matcher do it on the next refresh.
   */
  async uploadDocAndLinkToTx(
    firebaseId: string,
    businessNumber: string,
    slimTransactionId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ): Promise<{ ok: true; documentId: number }> {
    const { slim } = await this.loadTxPair(firebaseId, businessNumber, slimTransactionId);
    if (slim.matchedDocumentId) {
      throw new BadRequestException(
        `Transaction ${slimTransactionId} is already linked to document ${slim.matchedDocumentId}`,
      );
    }

    const newDoc = await this.documentsService.uploadAndOcrDoc(
      firebaseId,
      businessNumber,
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    await this.matchingService.linkDocToTx(
      firebaseId,
      businessNumber,
      newDoc.id,
      slimTransactionId,
    );

    this.logger.log(
      `uploadDocAndLinkToTx: doc=${newDoc.id} ↔ tx=${slimTransactionId} (biz=${businessNumber}, file="${file.originalname}", size=${file.size}B)`,
    );
    return { ok: true, documentId: newDoc.id };
  }

  // ====================================================================
  // DELETE — same shape as archive, different terminal status
  // ====================================================================

  /**
   * "מחק" on a doc-side row. Same handling as archive (file stays in
   * processed/, slim matched row gets reset) — the only difference vs
   * archive is `status = REJECTED` instead of ARCHIVED.
   *
   *   ARCHIVED — "I'm not claiming it now but the doc is real, keep for audit."
   *   REJECTED — "This isn't a real expense doc — OCR junk, duplicate, etc."
   *
   * Both leave the DB row in place (soft-delete) so a future reports/admin
   * UI can re-surface rejected docs if needed.
   *
   * Implementation: delegates to documentsService.archiveDocument with the
   * REJECTED target status — the matched-slim reset logic is single-sourced
   * there.
   */
  async deleteDoc(
    firebaseId: string,
    documentId: number,
  ): Promise<{ ok: true; documentId: number; movedFile: boolean }> {
    return this.documentsService.archiveDocument(
      firebaseId,
      documentId,
      ExtractedDocStatus.REJECTED,
    );
  }

  // ====================================================================
  // REJECT — "this transaction is NOT an expense, don't surface it again"
  // ====================================================================

  /**
   * "מחק" on a tx_only row. Resets the slim transaction so the matcher
   * and review modal both drop it on the next preview:
   *   - isRecognized = false        → matcher + tx_only query skip it
   *   - matchedDocumentId = null    → defensive; tx_only rows are already
   *                                   matchedDocumentId=null by definition
   *
   * The slim row stays in the DB (no hard-delete) so the user can re-
   * classify it from the dashboard if they change their mind.
   *
   * vatReportingDate is intentionally NOT stamped here — `isRecognized=false`
   * already removes the tx from every review/matcher query; stamping a
   * period label on a row the user just rejected would mis-signal it as
   * "reported in period X".
   */
  async rejectTx(
    firebaseId: string,
    businessNumber: string,
    slimTransactionId: number,
  ): Promise<{ ok: true }> {
    const { slim } = await this.loadTxPair(firebaseId, businessNumber, slimTransactionId);
    await this.slimRepo.update(
      { id: slim.id },
      { isRecognized: false, matchedDocumentId: null },
    );
    this.logger.log(`rejectTx: tx=${slim.id} (biz=${businessNumber}) marked not-an-expense`);
    return { ok: true };
  }

  // ====================================================================
  // HELPERS
  // ====================================================================

  /** Load eligible (expense-classified, not-yet-confirmed) slim
   *  transactions whose date is on or before the period end. Upper
   *  bound only — late-classified transactions from prior periods stay
   *  visible until the user resolves them, matching the doc-side scope
   *  in `getReportPreview` step 3. */
  private async loadTransactionsInRange(
    firebaseId: string,
    businessNumber: string,
    range: { from: Date; to: Date },
  ): Promise<Array<{ slim: SlimTransaction; cache: FullTransactionCache }>> {
    const rows = await this.slimRepo
      .createQueryBuilder('slim')
      .innerJoinAndMapOne(
        'slim.cache',
        FullTransactionCache,
        'cache',
        'cache.userId = slim.userId AND cache.externalTransactionId = slim.externalTransactionId',
      )
      .where('slim.businessNumber = :bn', { bn: businessNumber })
      .andWhere('slim.isRecognized = true')
      .andWhere('slim.confirmed = false')
      .andWhere('cache.transactionDate <= :to', { to: range.to })
      .orderBy('cache.transactionDate', 'ASC')
      .getMany();

    // joinAndMapOne attaches `.cache` to the slim row at runtime.
    return rows.map(r => ({
      slim: r,
      cache: (r as any).cache as FullTransactionCache,
    }));
  }

  /** Both halves of a matched pair must (a) exist, (b) belong to the
   *  caller, (c) be in a state where approve makes sense. Throws with a
   *  specific message on any failure so the UI can surface what went wrong
   *  rather than a generic 500. */
  private async loadMatchedPair(
    firebaseId: string,
    businessNumber: string,
    documentId: number,
    slimTransactionId: number,
  ): Promise<{ doc: ExtractedDocument; slim: SlimTransaction; cache: FullTransactionCache }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    await this.assertDocOwnership(doc, firebaseId, businessNumber);
    if (doc.status !== ExtractedDocStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Document ${documentId} is not pending_review (status=${doc.status})`,
      );
    }
    if (doc.matchedTransactionId !== slimTransactionId) {
      throw new BadRequestException(
        `Document ${documentId} is not paired with transaction ${slimTransactionId} ` +
        `(current pair: ${doc.matchedTransactionId ?? 'none'})`,
      );
    }
    const { slim, cache } = await this.loadTxPair(firebaseId, businessNumber, slimTransactionId);
    return { doc, slim, cache };
  }

  /** Single-tx loader for the tx-side action paths. */
  private async loadTxPair(
    firebaseId: string,
    businessNumber: string,
    slimTransactionId: number,
  ): Promise<{ slim: SlimTransaction; cache: FullTransactionCache }> {
    const slim = await this.slimRepo.findOne({ where: { id: slimTransactionId } });
    if (!slim) throw new NotFoundException(`Transaction ${slimTransactionId} not found`);
    if (slim.businessNumber !== businessNumber) {
      throw new ForbiddenException(`Transaction ${slimTransactionId} is not in business ${businessNumber}`);
    }
    if (slim.confirmed) {
      throw new BadRequestException(`Transaction ${slimTransactionId} is already confirmed`);
    }
    const cache = await this.cacheRepo.findOne({
      where: {
        userId: slim.userId,
        externalTransactionId: slim.externalTransactionId,
      },
    });
    if (!cache) {
      // Should be unreachable — slim rows are only created when their cache
      // row exists. Throw rather than fabricate amount/date.
      throw new NotFoundException(
        `FullTransactionCache for slim ${slimTransactionId} not found`,
      );
    }
    return { slim, cache };
  }

  private async assertDocOwnership(
    doc: ExtractedDocument,
    firebaseId: string,
    businessNumber: string,
  ): Promise<void> {
    if (doc.businessNumber !== businessNumber) {
      throw new ForbiddenException(`Document ${doc.id} is not in business ${businessNumber}`);
    }
    // Document-side ownership is enforced via userId (numeric user.index).
    // Cheap re-check so manual API calls can't act on someone else's docs.
    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user || doc.userId !== user.index) {
      throw new ForbiddenException(`Document ${doc.id} does not belong to caller`);
    }
  }

  private async linkOwnershipCheckTx(
    firebaseId: string,
    businessNumber: string,
    slimTransactionId: number,
  ): Promise<void> {
    const slim = await this.slimRepo.findOne({ where: { id: slimTransactionId } });
    if (!slim) throw new NotFoundException(`Transaction ${slimTransactionId} not found`);
    if (slim.businessNumber !== businessNumber) {
      throw new ForbiddenException(`Transaction ${slimTransactionId} is not in business ${businessNumber}`);
    }
  }

  /** Document row → wire shape. Number casts protect against TypeORM
   *  returning decimals as strings from MySQL. `knownSupplierById` maps
   *  supplierID → the user's saved Supplier master row, pre-computed by the
   *  caller so we don't run an extra query per document.
   *
   *  When the doc's supplier is in that map, the row's classification
   *  (category / sub-category / vat% / tax% / isEquipment) is hydrated from
   *  the saved supplier rather than from the OCR guess — the master record
   *  is the user's authoritative classification for that vendor, so a known
   *  supplier should land in the review modal already filled in. The OCR
   *  values remain the fallback when the doc has no known supplier (or the
   *  saved field is blank). */
  private toDocSummary(
    d: ExtractedDocument,
    knownSupplierById: Map<string, Supplier>,
  ): ReviewDocSummary {
    const supplierKey = d.supplierId?.trim();
    const savedSupplier = supplierKey ? knownSupplierById.get(supplierKey) : undefined;

    return {
      documentId: d.id,
      driveFileId: d.driveFileId,
      driveFileName: d.driveFileName,
      supplier: d.supplier,
      supplierId: d.supplierId,
      date: d.date,
      invoiceNumber: d.invoiceNumber,
      allocationNumber: d.allocationNumber,
      amount: d.amount != null ? Number(d.amount) : null,
      // Saved-supplier classification wins over the OCR guess for known
      // vendors; fall back to the OCR'd value when no master row exists.
      category: savedSupplier?.category || d.category,
      subCategory: savedSupplier?.subCategory || d.subCategory,
      vatPercent: savedSupplier?.vatPercent != null
        ? Number(savedSupplier.vatPercent)
        : (d.vatPercent != null ? Number(d.vatPercent) : null),
      taxPercent: savedSupplier?.taxPercent != null
        ? Number(savedSupplier.taxPercent)
        : (d.taxPercent != null ? Number(d.taxPercent) : null),
      isEquipment: savedSupplier?.isEquipment ?? d.isEquipment,
      uploadDate: d.uploadDate ? d.uploadDate.toISOString() : null,
      documentType: d.documentType,
      currency: d.currency ?? 'ILS',
      ilsAmount: d.ilsAmount != null ? Number(d.ilsAmount) : null,
      matchedSupplierKnown: !!savedSupplier,
    };
  }

  /** Slim+cache → wire shape. Amount is the positive ILS value; original
   *  currency is surfaced separately so the modal can show "$50 (₪185)". */
  private toTxSummary(slim: SlimTransaction, cache: FullTransactionCache): ReviewTxSummary {
    const isNonIls = cache.currency && cache.currency !== 'ILS';
    return {
      slimTransactionId: slim.id,
      externalTransactionId: slim.externalTransactionId,
      date: this.dateToYmd(cache.transactionDate),
      amount: this.absIls(cache),
      merchantName: cache.merchantName,
      category: slim.category,
      subCategory: slim.subCategory,
      vatPercent: slim.vatPercent,
      taxPercent: slim.taxPercent,
      isEquipment: slim.isEquipment,
      originalAmount: isNonIls ? Math.abs(Number(cache.amount)) : null,
      originalCurrency: isNonIls ? cache.currency : null,
    };
  }

  /** Positive ILS value for a cache row, mirroring the FX rule used
   *  everywhere else: prefer pre-converted ilsAmount, fall back to
   *  abs(amount) since expenses are stored negative. */
  private absIls(cache: FullTransactionCache): number {
    if (cache.ilsAmount != null) return Number(cache.ilsAmount);
    return Math.abs(Number(cache.amount));
  }

  /**
   * Build the sum/originalCurrency/originalSum trio to feed into
   * `ExpensesService.addExpense` from an OCR'd document. addExpense's
   * internal FX path activates whenever `originalCurrency` is set and
   * not 'ILS' AND `originalSum` is present — it pulls the BOI rate at
   * the expense date and stamps `originalCurrency` + `originalSum` on
   * the resulting Expense for the dashboard's "$X (₪Y)" rendering. For
   * ILS docs we just pass `sum` and leave the original fields null so
   * that branch doesn't fire.
   */
  private buildExpenseAmountFromDoc(doc: ExtractedDocument): {
    sum: number;
    originalCurrency: string | null;
    originalSum: number | null;
  } {
    const rawAmount = Number(doc.amount ?? 0);
    const currency = (doc.currency ?? 'ILS').toUpperCase();
    if (currency !== 'ILS') {
      return {
        // sum gets overwritten by the FX conversion inside addExpense,
        // but the create() helper still needs a numeric value so the
        // entity field has the right type during the intermediate step.
        sum: rawAmount,
        originalCurrency: currency,
        originalSum: rawAmount,
      };
    }
    return { sum: rawAmount, originalCurrency: null, originalSum: null };
  }

  private dateToYmd(d: Date): string {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
}
