import { PdfTextExtractionResult } from './pdf-text-extraction.util';

export type IntakeDecision =
  | { kind: 'relevant'; reason: 'accounting_keyword' }
  | { kind: 'ai_review'; reason: 'ambiguous_document' }
  | { kind: 'review_required'; reason: 'password_required' | 'pdf_unreadable' | 'ai_disabled' | 'ai_budget' | 'ai_limits' };

/** AI classification happens once, in the existing durable Drive/OCR pipeline.
 * A failed local parser is not evidence that a document is irrelevant.
 */
export function decideEmailIntake(input: {
  keyword: boolean; pdf?: PdfTextExtractionResult; bytes: number;
  aiEnabled: boolean; remaining: number;
}): IntakeDecision {
  if (input.pdf?.outcome === 'PASSWORD_REQUIRED') return { kind: 'review_required', reason: 'password_required' };
  if (input.pdf && !['EXTRACTED', 'NO_TEXT'].includes(input.pdf.outcome)) return { kind: 'review_required', reason: 'pdf_unreadable' };
  if (input.keyword) return { kind: 'relevant', reason: 'accounting_keyword' };
  if (!input.aiEnabled) return { kind: 'review_required', reason: 'ai_disabled' };
  if (input.bytes > 10 * 1024 * 1024 || (input.pdf?.pages ?? 0) > 20) return { kind: 'review_required', reason: 'ai_limits' };
  if (input.remaining <= 0) return { kind: 'review_required', reason: 'ai_budget' };
  return { kind: 'ai_review', reason: 'ambiguous_document' };
}
