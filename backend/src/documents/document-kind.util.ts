import { DocumentKind } from 'src/enum';
import { ExtractedDocumentType } from './extracted-document.entity';

/**
 * D8 (Phase 4.3) — derive the OCR-pipeline routing kind from Claude's
 * document-type classification, at insert time. Same rule as the Phase-3
 * backfill (backend/scripts/migrations/2026-07-13_phase3_backfill.ts, which
 * keeps its own frozen copy):
 *
 *   expense-shaped types → EXPENSE_INVOICE  (normal approval flow)
 *   form_106 / tax_form  → ANNUAL_DOCUMENT  (never journaled — "תייק" flow)
 *   contract / unknown / null → UNIDENTIFIED (pending human triage)
 */
const EXPENSE_SHAPED = new Set<ExtractedDocumentType>([
  ExtractedDocumentType.INVOICE,
  ExtractedDocumentType.RECEIPT,
  ExtractedDocumentType.TAX_INVOICE_RECEIPT,
  ExtractedDocumentType.CREDIT_INVOICE,
  ExtractedDocumentType.INVOICE_RECEIPT_PAIR,
]);

const ANNUAL_TYPES = new Set<ExtractedDocumentType>([
  ExtractedDocumentType.FORM_106,
  ExtractedDocumentType.TAX_FORM,
]);

export function deriveDocumentKind(documentType: ExtractedDocumentType | null | undefined): DocumentKind {
  if (documentType && EXPENSE_SHAPED.has(documentType)) return DocumentKind.EXPENSE_INVOICE;
  if (documentType && ANNUAL_TYPES.has(documentType)) return DocumentKind.ANNUAL_DOCUMENT;
  return DocumentKind.UNIDENTIFIED;
}
