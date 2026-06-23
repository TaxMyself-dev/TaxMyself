import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

/**
 * The static extraction prompt — combined SYSTEM_PROMPT + extraction template.
 * Kept as one literal so the bytes are stable across every request and the
 * prefix-match cache key never drifts. Goes in the FIRST system block.
 *
 * This block alone is ~700-900 tokens on Sonnet 4.6 (below the 2048-token
 * cache minimum), so it isn't a cacheable prefix by itself — the catalog
 * block that follows is what pushes the system prefix over the minimum and
 * makes the cache fire. The `cache_control` marker goes on the LAST system
 * block (the catalog), not here, so the whole `tools → system` prefix
 * caches as one entry.
 */
const STATIC_EXTRACTION_PROMPT = `You are an expert accountant assistant. Extract structured data from invoices and receipts.
Always respond with valid JSON only, no explanation, no markdown.
Handle Hebrew and English documents.
If a field is not found, return null for that field.

This file may contain one OR MORE invoices/receipts (common cases: monthly
fuel statements, bundled scans, batched receipts). Identify EVERY invoice in
the file and return all of them.

For each invoice extract:
- document_type (string): one of "invoice", "receipt", "tax_invoice_receipt", "credit_invoice", "form_106", "tax_form", "contract", "unknown".
    Distinguishing invoice from receipt is IMPORTANT — they sound similar
    in English but they are different documents in Israel and the user's
    accountant treats them differently.
    * "invoice"              — חשבונית / חשבונית מס: a BILL from a supplier,
                                 issued BEFORE payment. The supplier is asking
                                 to be paid. Header usually says "חשבונית"
                                 or "Invoice" or "Tax Invoice".
    * "receipt"              — קבלה / Receipt: a CONFIRMATION of payment,
                                 issued AFTER the buyer paid. Header usually
                                 says "קבלה" or "Receipt". Often shows a
                                 payment method (cash / card / bank transfer).
    * "tax_invoice_receipt"  — חשבונית מס קבלה: a COMBINED document that's
                                 both an invoice AND a receipt in one piece
                                 of paper. Header says both "חשבונית" and
                                 "קבלה" together.
    * "credit_invoice"       — חשבונית זיכוי / Credit Note / Credit Invoice:
                                 a REVERSAL of a prior invoice (refund, return,
                                 cancellation). Header says "חשבונית זיכוי" or
                                 "Credit Note"/"Credit Invoice"/"חשבונית
                                 ביטול". Amounts are conceptually negative
                                 (money goes back to the buyer) — return the
                                 amount as a positive number and trust the
                                 document_type to signal direction.
    * "form_106"             — Israeli annual employee tax statement (טופס 106)
    * "tax_form"             — any other tax-authority document
                                 (e.g. שומה, אישור ניכוי מס במקור)
    * "contract"             — a contract / agreement
    * "unknown"              — anything that doesn't fit the above
  Pick the BEST single match. Default to "invoice" only when you're sure;
  if you see "קבלה" or "Receipt" anywhere in the header, prefer "receipt"
  (or "tax_invoice_receipt" if "חשבונית" also appears, or "credit_invoice"
  if it's a reversal of a prior charge).
- supplier (string): supplier/vendor name
- supplier_id (string): supplier's Israeli business / tax ID number (מספר עוסק / ח.פ.) — digits only, no dashes or spaces
- date (string): invoice date in YYYY-MM-DD format
- invoice_number (string): the INVOICE number printed on the document.
    IMPORTANT for receipts: if the document is a receipt (document_type=
    "receipt"), use the INVOICE NUMBER it references — NOT the receipt's
    own receipt-number. Receipts usually print BOTH:
      "Invoice number OFOBCQET-0004"      ← THIS goes into invoice_number
      "Receipt number 2280-0056-3066"     ← ignore for this field
    Same rule in Hebrew: "מספר חשבונית" wins over "מספר קבלה". The
    pairing service relies on this: it matches a receipt to its invoice
    by exact-equality on invoice_number, which only works if both rows
    carry the same value (the invoice's number, on both sides).
    For documents that are themselves invoices (document_type="invoice",
    "tax_invoice_receipt", "credit_invoice"), invoice_number is just the
    document's own number. Return null if no number is printed.
- allocation_number (string): Israeli tax authority allocation number (מספר הקצאה / Confirmation Number). Required on tax invoices over the threshold; null if not present.
- amount (number): total amount including VAT — in the document's own currency,
                   NOT pre-converted to ILS
- vat (number): VAT amount in the same currency as the amount field
- amount_before_vat (number): amount before VAT, same currency as above
- currency (string): ISO-4217 code of the currency the amounts are printed in.
    Look for, in order of priority:
      * Explicit ISO code printed near the amount ("ILS", "USD", "EUR")
      * Currency symbol next to the amount: ₪ → "ILS", $ → "USD",
        € → "EUR", £ → "GBP"
      * Hebrew currency words: "שקל" / "ש"ח" / "שקלים" → "ILS";
        "דולר" / "דולרים" → "USD"; "אירו" / "יורו" → "EUR"
      * Country/issuer cues: an Israeli supplier-id (ח.פ.) on the document
        is a strong signal for "ILS" — but only as a tiebreaker, not as
        an override when an explicit symbol or code is visible
    Always return a 3-letter ISO code (uppercase). If you genuinely cannot
    find ANY currency indicator, return "ILS" (most documents in this
    system are Israeli) — but only as a last resort.
- category (string): parent category of the chosen sub-category (exact value from catalog)
- sub_category (string): the picked sub_category_name (exact value from catalog)
- tax_percent (number): copy from the picked sub-category
- vat_percent (number): copy from the picked sub-category
- is_equipment (boolean): copy from the picked sub-category
- description (string): brief description of the expense

If nothing in the catalog matches, set category/sub_category to null and
tax_percent/vat_percent/is_equipment to null. Don't invent categories.

Return ONLY a JSON object with this exact shape:
{ "invoices": [ {...}, {...}, ... ] }

If the file contains a single invoice, return an array with one element.
If the file contains no recognizable invoices, return { "invoices": [] }.
Do NOT aggregate multiple invoices into one — split them.

The "Available expense sub-categories" list follows in the next block.
Pick the BEST match for each invoice by sub_category_name and COPY its
values exactly.`;

/**
 * Build the catalog block as a separate, deterministic string. Goes in the
 * SECOND system block with the `cache_control` marker — within one inbox
 * processing run, every file uses the same catalog, so the second OCR call
 * onward should hit the cache.
 *
 * Caching invariant: sort by sub_category name. Anthropic caching is a
 * prefix BYTE match — if iteration order ever changes (e.g. the upstream
 * query swaps `ORDER BY`), the cache key changes and we get 0% hits even
 * though the content is semantically identical. Explicit sort here defends
 * against that silent invalidator.
 */
function buildCatalogBlock(catalog: CatalogEntry[]): string {
  if (catalog.length === 0) {
    return 'Available expense sub-categories: (no catalog provided — leave category/sub_category/tax/vat empty)';
  }
  const sorted = [...catalog].sort((a, b) =>
    a.subCategoryName.localeCompare(b.subCategoryName),
  );
  const lines = sorted
    .map(c =>
      `- "${c.subCategoryName}" (category: "${c.categoryName}", vat%: ${c.vatPercent}, tax%: ${c.taxPercent}, equipment: ${c.isEquipment})`,
    )
    .join('\n');
  return `Available expense sub-categories:\n${lines}`;
}

/** Trivial trailer that goes in the user turn alongside the file block. The
 *  real instructions live in the cached system blocks above — this is just
 *  the kick-off. Keeping it short keeps the per-request token cost minimal. */
const USER_TRAILER = 'Extract every invoice from the attached file as instructed.';

export interface CatalogEntry {
  subCategoryName: string;
  categoryName: string;
  taxPercent: number;
  vatPercent: number;
  isEquipment: boolean;
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export interface ExtractedFields {
  document_type: string | null;       // invoice | receipt | tax_invoice_receipt | form_106 | tax_form | contract | unknown
  supplier: string | null;
  supplier_id: string | null;
  date: string | null;
  invoice_number: string | null;
  allocation_number: string | null;
  /** Amount in the document's OWN currency — see `currency` field below.
   *  NOT pre-converted to ILS by the model; the approve flow does that. */
  amount: number | null;
  vat: number | null;
  amount_before_vat: number | null;
  /** ISO-4217 currency code (uppercase) of `amount` / `vat` / `amount_before_vat`.
   *  Defaults to "ILS" when the model couldn't find any explicit indicator. */
  currency: string | null;
  category: string | null;
  sub_category: string | null;
  tax_percent: number | null;
  vat_percent: number | null;
  is_equipment: boolean | null;
  description: string | null;
}

export interface ProcessOutcome {
  // Null when Claude's output couldn't be parsed as the expected shape.
  // Empty array when Claude ran but found no invoices in the file.
  invoices: ExtractedFields[] | null;
  rawResponse: string;
}

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY env var is missing');
    }
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  isSupportedMimeType(mimeType: string): boolean {
    return mimeType === 'application/pdf' || SUPPORTED_IMAGE_TYPES.has(mimeType);
  }

  async extract(
    fileBuffer: Buffer,
    mimeType: string,
    catalog: CatalogEntry[] = [],
  ): Promise<ProcessOutcome> {
    const client = this.getClient();
    const base64 = fileBuffer.toString('base64');
    const catalogBlock = buildCatalogBlock(catalog);

    const fileBlock =
      mimeType === 'application/pdf'
        ? {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
          }
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mimeType as any, data: base64 },
          };

    this.logger.log(`Calling Claude (${MODEL}) | mimeType=${mimeType} | size=${fileBuffer.length}B`);

    const response = await client.messages.create({
      model: MODEL,
      // Bumped from 1024 — multi-invoice statements (e.g. monthly fuel with
      // 12+ rows) can exceed 1024 tokens of structured JSON and get truncated,
      // which leaves the closing ``` missing and the JSON unparseable.
      max_tokens: 8192,
      // Two system blocks:
      //   [0] Static extraction prompt — bytes never change. By itself ~700-900
      //       tokens (below Sonnet 4.6's 2048-token cache minimum), so no
      //       cache marker here — caching only fires when block[1] pushes the
      //       combined prefix over the minimum.
      //   [1] Catalog — per-business but stable across every file processed
      //       in one inbox run. Sorted deterministically by buildCatalogBlock
      //       so the cache key is byte-stable. cache_control sits here so the
      //       full `system` prefix (block[0] + block[1]) caches as one entry.
      //       Within an inbox batch: file #1 writes the cache, files #2..N read.
      //       Across batches: read hits while the catalog stays unchanged for
      //       this business and the 5-min TTL hasn't elapsed.
      system: [
        { type: 'text', text: STATIC_EXTRACTION_PROMPT },
        {
          type: 'text',
          text: catalogBlock,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [fileBlock as any, { type: 'text', text: USER_TRAILER }],
        },
      ],
    });

    // Cache telemetry — surfaces whether the rewrite is actually paying off.
    // If `cache_read_input_tokens` stays at 0 across repeated calls in the
    // same inbox run, there's a silent invalidator at work (typically a
    // non-deterministic catalog order, or the catalog size keeping the
    // system prefix under the 2048-token minimum). See shared/prompt-caching
    // in the claude-api skill for the audit checklist.
    const usage = (response as any).usage;
    if (usage) {
      this.logger.log(
        `Claude usage | input=${usage.input_tokens ?? 0} ` +
        `cache_read=${usage.cache_read_input_tokens ?? 0} ` +
        `cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
        `output=${usage.output_tokens ?? 0}`,
      );
    }

    const rawResponse = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    let invoices: ExtractedFields[] | null = null;
    const stripped = this.stripJsonFence(rawResponse);
    try {
      const parsed = JSON.parse(stripped);
      // Expected shape: { invoices: [...] }. Be defensive about Claude
      // occasionally returning a bare array or a single object instead.
      if (Array.isArray(parsed?.invoices)) {
        invoices = parsed.invoices as ExtractedFields[];
      } else if (Array.isArray(parsed)) {
        invoices = parsed as ExtractedFields[];
      } else if (parsed && typeof parsed === 'object') {
        invoices = [parsed as ExtractedFields];
      }
    } catch (err) {
      // Log a snippet of what we actually tried to parse — the raw response
      // can be huge, but the head/tail usually reveal the problem (missing
      // closing fence, prose before/after the JSON, truncated mid-token).
      const head = stripped.slice(0, 120).replace(/\s+/g, ' ');
      const tail = stripped.slice(-80).replace(/\s+/g, ' ');
      this.logger.warn(
        `Claude returned non-JSON output | raw=${rawResponse.length}ch | stripped=${stripped.length}ch | err=${err?.message ?? err} | head="${head}" | tail="${tail}"`,
      );
    }

    if (invoices) {
      this.logger.log(`Claude extracted ${invoices.length} invoice(s) from this file`);
    }

    return { invoices, rawResponse };
  }

  // Claude occasionally wraps JSON in ```json ... ``` despite the prompt
  // forbidding markdown — sometimes with prose before or after the fence,
  // sometimes without a closing fence at all. Extract the JSON body as best
  // we can so JSON.parse has a chance.
  private stripJsonFence(text: string): string {
    // Match a fenced block anywhere in the text (no anchor at start/end).
    // Tolerant of leading prose ("Here is the JSON: ```json...") and trailing
    // explanation ("```\nLet me know if you need...").
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    // No fence at all (or unclosed). Fall back to slicing from the first
    // bracket to the last matching bracket. Naive but usually enough.
    const firstObj = text.indexOf('{');
    const firstArr = text.indexOf('[');
    const candidates = [firstObj, firstArr].filter(i => i !== -1);
    if (candidates.length === 0) return text.trim();
    const start = Math.min(...candidates);
    const lastObj = text.lastIndexOf('}');
    const lastArr = text.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (end < start) return text.trim();
    return text.substring(start, end + 1).trim();
  }
}
