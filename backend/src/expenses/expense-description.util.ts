import { ExtractedDocumentType } from '../documents/extracted-document.entity';

/**
 * D7 — עמודת תיאור. Single source of truth for an expense's description,
 * fallback chain:
 *   1. Has classification (category + subCategory) -> "{category}/{subCategory}"
 *   2. No classification, but the source document has a recognized type ->
 *      the type name, +doc number/supplier when available
 *   3. Nothing recognized -> "מסמך לא מזוהה"
 *
 * Recomputed on every classification change while PENDING (Phase 4); frozen
 * into expense.description / journal_entry.description at approval. Phase
 * 3.4 backfills existing rows with this same function — every current
 * expense already has category+subCategory (non-nullable columns), so
 * branch 1 always applies to backfilled data; branches 2/3 exist for the
 * Phase 4 OCR/D8 write path where an expense may not have a classification.
 */

const DOCUMENT_TYPE_LABELS: Partial<Record<ExtractedDocumentType, string>> = {
  [ExtractedDocumentType.FORM_106]: 'טופס 106',
  [ExtractedDocumentType.TAX_FORM]: 'אישור מס',
  [ExtractedDocumentType.CONTRACT]: 'חוזה',
  [ExtractedDocumentType.INVOICE]: 'חשבונית',
  [ExtractedDocumentType.RECEIPT]: 'קבלה',
  [ExtractedDocumentType.TAX_INVOICE_RECEIPT]: 'חשבונית מס קבלה',
  [ExtractedDocumentType.CREDIT_INVOICE]: 'חשבונית זיכוי',
};

export interface DescriptionExpenseInput {
  category?: string | null;
  subCategory?: string | null;
}

export interface DescriptionDocInput {
  documentType?: ExtractedDocumentType | null;
  supplier?: string | null;
  invoiceNumber?: string | null;
}

export function buildExpenseDescription(
  expense: DescriptionExpenseInput,
  doc?: DescriptionDocInput | null,
): string {
  const category = expense.category?.trim();
  const subCategory = expense.subCategory?.trim();
  if (category && subCategory) {
    return `${category}/${subCategory}`;
  }

  if (doc?.documentType) {
    const typeName = DOCUMENT_TYPE_LABELS[doc.documentType];
    if (typeName) {
      const detail = doc.supplier?.trim() || doc.invoiceNumber?.trim();
      return detail ? `${typeName} - ${detail}` : typeName;
    }
  }

  return 'מסמך לא מזוהה';
}
