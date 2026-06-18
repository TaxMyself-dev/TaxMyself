import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExtractedDocument,
  ExtractedDocStatus,
  ExtractedDocumentType,
} from './extracted-document.entity';

/**
 * Window for the amount+date fallback pairing rule (used when both rows
 * lack an invoice_number to anchor on). Tighter than the doc↔tx matcher's
 * tolerances because pairing is between two docs claiming to describe
 * the same transaction — they should be nearly identical, not just close.
 */
const PAIRING_AMOUNT_TOLERANCE_ILS = 0.01;
const PAIRING_DATE_TOLERANCE_DAYS  = 3;

/** Internal: the columns the pairing service reads off each candidate. */
interface PairingCandidate {
  id: number;
  documentType: ExtractedDocumentType | null;
  supplier: string | null;
  supplierId: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  date: string | null;
  status: ExtractedDocStatus;
  pairedWithDocumentId: number | null;
}

/**
 * Auto-pair invoice and receipt rows that describe the same purchase.
 * Runs after `processInboxForUser` and before the doc↔transaction matcher
 * in `getReportPreview`, so the matcher sees one combined row instead of
 * an invoice and a receipt competing for the same bank transaction.
 *
 * Detection rules (first match wins):
 *   1. Same `supplierId` + same `invoiceNumber` — the strong signal.
 *      Real receipts almost always carry the invoice_number they paid.
 *   2. Same `supplierId` + amount within ±0.01 + date within ±3 days —
 *      fallback when invoice_number is missing on either side (older
 *      systems sometimes omit it from one or the other).
 *
 * Outcome of a pair (R = receipt, I = invoice):
 *   - R.documentType  → INVOICE_RECEIPT_PAIR
 *   - R.pairedWithId  → I.id
 *   - I.status        → PAIRED
 *   - I.pairedWithId  → R.id
 *
 * Idempotent + skip-safe:
 *   - Already-paired rows skipped (pairedWithDocumentId IS NOT NULL).
 *   - APPROVED rows skipped (don't retroactively pair into a live Expense
 *     — receipt arrives weeks later and the user already paid the invoice).
 *   - ARCHIVED/REJECTED/ERROR skipped (terminal, no pairing).
 *   - Only PENDING_REVIEW on both sides participates.
 */
@Injectable()
export class DocumentPairingService {
  private readonly logger = new Logger(DocumentPairingService.name);

  constructor(
    @InjectRepository(ExtractedDocument)
    private readonly docRepo: Repository<ExtractedDocument>,
  ) {}

  /**
   * Scan + pair for one (user, business) scope. Returns the number of
   * pairs actually created — useful for the preview log line. Caller is
   * responsible for ordering: must run AFTER inbox OCR persistence so
   * the candidate pool includes the latest rows.
   */
  async pairInvoicesAndReceiptsForBusiness(
    userIndex: number,
    businessNumber: string,
  ): Promise<{ paired: number; considered: number }> {
    const candidates = await this.loadCandidates(userIndex, businessNumber);
    if (candidates.length < 2) {
      return { paired: 0, considered: candidates.length };
    }

    const invoices: PairingCandidate[] = [];
    const receipts: PairingCandidate[] = [];
    for (const c of candidates) {
      if (c.documentType === ExtractedDocumentType.INVOICE) invoices.push(c);
      else if (c.documentType === ExtractedDocumentType.RECEIPT) receipts.push(c);
    }
    if (invoices.length === 0 || receipts.length === 0) {
      return { paired: 0, considered: candidates.length };
    }

    // O(I × R) is fine — pairing pool per (user, business) is bounded by
    // pending_review at any moment, which in practice is dozens not
    // thousands. If that ever stops being true, swap to a Map keyed by
    // (supplierId, invoiceNumber) — O(I + R).
    const consumedInvoiceIds = new Set<number>();
    const consumedReceiptIds = new Set<number>();
    const pairs: Array<{ invoice: PairingCandidate; receipt: PairingCandidate; reason: string }> = [];

    for (const r of receipts) {
      if (consumedReceiptIds.has(r.id)) continue;
      const match = invoices.find((inv) => {
        if (consumedInvoiceIds.has(inv.id)) return false;
        return this.isPair(inv, r);
      });
      if (!match) continue;
      consumedInvoiceIds.add(match.id);
      consumedReceiptIds.add(r.id);
      pairs.push({
        invoice: match,
        receipt: r,
        reason: this.isStrongMatch(match, r) ? 'invoice_number' : 'amount+date',
      });
    }

    if (pairs.length === 0) {
      return { paired: 0, considered: candidates.length };
    }

    // Apply pair writes in sequence — small N, simpler than batching.
    for (const { invoice, receipt, reason } of pairs) {
      await this.docRepo.update(
        { id: receipt.id },
        {
          documentType: ExtractedDocumentType.INVOICE_RECEIPT_PAIR,
          pairedWithDocumentId: invoice.id,
        },
      );
      await this.docRepo.update(
        { id: invoice.id },
        {
          status: ExtractedDocStatus.PAIRED,
          pairedWithDocumentId: receipt.id,
        },
      );
      this.logger.log(
        `[pair] receipt=${receipt.id} ↔ invoice=${invoice.id} (supplierId=${receipt.supplierId ?? '?'}, by=${reason})`,
      );
    }

    return { paired: pairs.length, considered: candidates.length };
  }

  /**
   * Reverse a pair — either side can be the entry point (we follow the
   * back-pointer to find the partner). Sets the receipt back to type
   * RECEIPT, the invoice back to status PENDING_REVIEW, both back-
   * pointers to null. Idempotent: a row whose pairedWithDocumentId is
   * already NULL is left alone.
   */
  async unpair(documentId: number): Promise<{ ok: true; receiptId: number; invoiceId: number } | { ok: true; alreadyUnpaired: true }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new Error(`unpair: document ${documentId} not found`);
    }
    if (!doc.pairedWithDocumentId) {
      return { ok: true, alreadyUnpaired: true };
    }
    const partner = await this.docRepo.findOne({ where: { id: doc.pairedWithDocumentId } });
    if (!partner) {
      // Stale back-pointer (partner deleted somehow). Best-effort: clear
      // our own pointer and treat as unpaired.
      await this.docRepo.update({ id: doc.id }, { pairedWithDocumentId: null });
      return { ok: true, alreadyUnpaired: true };
    }

    // Decide which side is the receipt (primary) and which is the
    // invoice (secondary) so we restore each to its pre-pair state.
    const receipt = doc.documentType === ExtractedDocumentType.INVOICE_RECEIPT_PAIR
      ? doc
      : partner;
    const invoice = receipt === doc ? partner : doc;

    await this.docRepo.update(
      { id: receipt.id },
      {
        documentType: ExtractedDocumentType.RECEIPT,
        pairedWithDocumentId: null,
      },
    );
    await this.docRepo.update(
      { id: invoice.id },
      {
        status: ExtractedDocStatus.PENDING_REVIEW,
        pairedWithDocumentId: null,
      },
    );

    this.logger.log(`[unpair] receipt=${receipt.id} / invoice=${invoice.id}`);
    return { ok: true, receiptId: receipt.id, invoiceId: invoice.id };
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async loadCandidates(
    userIndex: number,
    businessNumber: string,
  ): Promise<PairingCandidate[]> {
    return this.docRepo
      .createQueryBuilder('d')
      .select([
        'd.id AS id',
        'd.documentType AS documentType',
        'd.supplier AS supplier',
        'd.supplierId AS supplierId',
        'd.invoiceNumber AS invoiceNumber',
        'd.amount AS amount',
        'd.date AS date',
        'd.status AS status',
        'd.pairedWithDocumentId AS pairedWithDocumentId',
      ])
      .where('d.userId = :uid', { uid: userIndex })
      .andWhere('d.businessNumber = :bn', { bn: businessNumber })
      .andWhere('d.status = :st', { st: ExtractedDocStatus.PENDING_REVIEW })
      .andWhere('d.pairedWithDocumentId IS NULL')
      .getRawMany<PairingCandidate>();
  }

  private isPair(invoice: PairingCandidate, receipt: PairingCandidate): boolean {
    if (!this.isSameSupplier(invoice, receipt)) return false;
    if (this.isStrongMatch(invoice, receipt)) return true;
    if (this.isFallbackMatch(invoice, receipt)) return true;
    return false;
  }

  /**
   * "Same supplier" check that works for both Israeli and foreign suppliers:
   *   - If BOTH rows have a non-empty supplierId (Israeli ח.פ./עוסק), they
   *     must match exactly — the strong path, no ambiguity.
   *   - If EITHER side is missing supplierId (typical for foreign suppliers
   *     like Anthropic/AWS/GitHub that have no Israeli tax ID), fall back
   *     to supplier-name equality (case-insensitive, trimmed). OCR is
   *     consistent enough on the supplier-name field across related docs
   *     from the same vendor that exact-equality is reliable for the
   *     pairing use case. If a vendor's OCR yields different name spellings
   *     for invoice vs receipt, the amount+date fallback (isFallbackMatch)
   *     still gets us there.
   */
  private isSameSupplier(a: PairingCandidate, b: PairingCandidate): boolean {
    const aId = a.supplierId?.trim();
    const bId = b.supplierId?.trim();
    if (aId && bId) return aId === bId;
    const aName = a.supplier?.trim().toLowerCase();
    const bName = b.supplier?.trim().toLowerCase();
    return !!aName && !!bName && aName === bName;
  }

  /** invoice_number on both sides + they match (case-insensitive, trimmed). */
  private isStrongMatch(invoice: PairingCandidate, receipt: PairingCandidate): boolean {
    const i = invoice.invoiceNumber?.trim().toLowerCase();
    const r = receipt.invoiceNumber?.trim().toLowerCase();
    return !!i && !!r && i === r;
  }

  /** amount within ±0.01 + date within ±3 days. Used when invoice_number
   *  is missing on either side. */
  private isFallbackMatch(invoice: PairingCandidate, receipt: PairingCandidate): boolean {
    if (invoice.amount == null || receipt.amount == null) return false;
    if (invoice.date == null || receipt.date == null) return false;
    const amtDiff = Math.abs(Number(invoice.amount) - Number(receipt.amount));
    if (amtDiff > PAIRING_AMOUNT_TOLERANCE_ILS) return false;
    const dDiff = Math.abs(
      (new Date(invoice.date as any).getTime() - new Date(receipt.date as any).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return Math.round(dDiff) <= PAIRING_DATE_TOLERANCE_DAYS;
  }
}
