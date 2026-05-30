import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are an expert accountant assistant. Extract structured data from invoices and receipts.
Always respond with valid JSON only, no explanation, no markdown.
Handle Hebrew and English documents.
If a field is not found, return null for that field.`;

function buildUserPrompt(catalog: CatalogEntry[]): string {
  const catalogLines = catalog.length === 0
    ? '(no catalog provided — leave category/sub_category/tax/vat empty)'
    : catalog
        .map(c =>
          `- "${c.subCategoryName}" (category: "${c.categoryName}", vat%: ${c.vatPercent}, tax%: ${c.taxPercent}, equipment: ${c.isEquipment})`,
        )
        .join('\n');

  return `This file may contain one OR MORE invoices/receipts (common cases: monthly
fuel statements, bundled scans, batched receipts). Identify EVERY invoice in
the file and return all of them.

Available expense sub-categories (pick the BEST match for each invoice by
sub_category_name and COPY its values exactly):
${catalogLines}

For each invoice extract:
- supplier (string): supplier/vendor name
- supplier_id (string): supplier's Israeli business / tax ID number (מספר עוסק / ח.פ.) — digits only, no dashes or spaces
- date (string): invoice date in YYYY-MM-DD format
- invoice_number (string): invoice or receipt number
- allocation_number (string): Israeli tax authority allocation number (מספר הקצאה / Confirmation Number). Required on tax invoices over the threshold; null if not present.
- amount (number): total amount including VAT
- vat (number): VAT amount
- amount_before_vat (number): amount before VAT
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
Do NOT aggregate multiple invoices into one — split them.`;
}

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
  supplier: string | null;
  supplier_id: string | null;
  date: string | null;
  invoice_number: string | null;
  allocation_number: string | null;
  amount: number | null;
  vat: number | null;
  amount_before_vat: number | null;
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
    const userPrompt = buildUserPrompt(catalog);

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
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [fileBlock as any, { type: 'text', text: userPrompt }],
        },
      ],
    });

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
