import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmailAccountContext, EmailPart, EmailProvider } from '../providers/email-provider';
import { EmailProviderError } from '../providers/email-provider.error';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationStatus } from '../enums/integrations.enums';
import { matchesAccountingDocumentKeyword } from '../utils/accounting-document-keywords.util';
import {
  GmailKeywordMatchSource,
  GmailPdfScanOutcome,
  GmailSkipReason,
  PdfContentScanAccumulator,
  SkippedAttachmentsAccumulator,
  tagGmailSyncError,
} from '../utils/gmail-sync-logging.util';
import { extractPdfText, PdfTextExtractionOutcome } from '../utils/pdf-text-extraction.util';

import { UserIntegrationsService } from './user-integrations.service';
import { decideEmailIntake } from '../utils/email-intake-decision';

/**
 * Default Gmail search when the caller does not pass one. Deliberately broad:
 * the priority is to never miss a real receipt, so the search does NOT
 * require receipt/invoice keywords — junk is filtered per-attachment below,
 * and the real receipt-vs-not decision belongs to the Claude analysis phase.
 */
export const DEFAULT_GMAIL_QUERY = 'has:attachment newer_than:90d';

/** Extensions we consider candidate receipt documents. */
const DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

/** Filename fragments that mark email assets rather than documents. */
const ASSET_NAME_PATTERN = /(?:^|[\/_. -])(logo|icon|banner|signature|templogo)(?:[\d_. -]|$)/i;

/** Tiny technical image payloads with no accounting signal are not documents. */
const MIN_TECHNICAL_IMAGE_BYTES = 256;

/** contentBase64 responses get large fast — keep the page size modest. */
const DEFAULT_MAX_RESULTS = 10;
const MAX_MAX_RESULTS = 25;

/** messages.list page size — 500 is the Gmail API maximum. */
const LIST_PAGE_SIZE = 500;

/** Guard against pathological/malicious MIME nesting. */
const MAX_MIME_DEPTH = 20;

/** Extraction outcomes that end the PDF-content fallback without a match. */
const PDF_OUTCOME_TO_SCAN_OUTCOME: Record<
  Exclude<PdfTextExtractionOutcome, 'EXTRACTED'>,
  GmailPdfScanOutcome
> = {
  NO_TEXT: GmailPdfScanOutcome.NO_TEXT,
  PASSWORD_REQUIRED: GmailPdfScanOutcome.PASSWORD_REQUIRED,
  TOO_LARGE: GmailPdfScanOutcome.TOO_LARGE,
  FAILED: GmailPdfScanOutcome.FAILED,
  UNAVAILABLE: GmailPdfScanOutcome.UNAVAILABLE,
};

/**
 * Simple boolean gate (no scoring): an attachment is a likely accounting
 * document when the filename, the email subject, OR the snippet/body names one
 * (see ACCOUNTING_DOCUMENT_KEYWORDS — the single shared list, also used for
 * PDF text below). Each field is matched independently so a keyword is never
 * accidentally formed across field boundaries.
 *
 * Returns WHICH field matched (or null) — the reader records it on the
 * accepted attachment so production logs can answer "why was this imported?".
 */
export function findKeywordMatchSource(
  filename: string | null | undefined,
  subject: string | null | undefined,
  snippetOrBody: string | null | undefined,
): GmailKeywordMatchSource | null {
  if (matchesAccountingDocumentKeyword(filename)) return GmailKeywordMatchSource.FILENAME;
  if (matchesAccountingDocumentKeyword(subject)) return GmailKeywordMatchSource.SUBJECT;
  if (matchesAccountingDocumentKeyword(snippetOrBody)) return GmailKeywordMatchSource.BODY;
  return null;
}

/** Back-compatible boolean form of findKeywordMatchSource. */
export function isLikelyInvoiceOrReceiptAttachment(
  filename: string | null | undefined,
  subject: string | null | undefined,
  snippetOrBody: string | null | undefined,
): boolean {
  return findKeywordMatchSource(filename, subject, snippetOrBody) !== null;
}

export interface GmailAttachmentFile {
  messageId: string;
  threadId: string | null;
  subject: string | null;
  from: string | null;
  date: string | null;
  attachmentId: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  /**
   * Which source carried the accounting-document keyword — 'pdf-content' means
   * the metadata said nothing and the PDF's own text rescued the file.
   */
  matchedBy: GmailKeywordMatchSource;
  /**
   * Raw file bytes. Internal representation — the controller serializes to
   * base64 for now; a later phase streams these to Google Drive instead.
   */
  content: Buffer;
}

export interface GmailAttachmentsResult {
  query: string;
  messagesFound: number;
  messagesWithAttachments: number;
  attachmentsFound: number;
  skippedWithoutFilename: number;
  /** Attachments dropped by the receipt-likeness filter (logos, inline assets, tiny images...). */
  skippedIrrelevant: number;
  /** Of `attachmentsFound`, how many were rescued by their PDF text. */
  matchedByPdfContent: number;
  attachments: GmailAttachmentFile[];
}

/** One scanned message, as yielded by scanMessages(). */
export interface GmailMessageScanResult {
  messageId: string;
  /** Receipt-candidate attachments of this one message (may be empty). */
  attachments: GmailAttachmentFile[];
  skippedWithoutFilename: number;
  skippedIrrelevant: number;
  /** Of `attachments`, how many matched only on their extracted PDF text. */
  matchedByPdfContent: number;
  /** True when the message could not be fetched/parsed — logged, attachments empty. */
  failed: boolean;
  reviewRequired?: number;
  aiReviewQueued?: number;
}

/**
 * Phase C — Gmail Reader. Searches the connected Google account's mailbox for
 * candidate receipt/invoice emails and downloads their attachments.
 * It does NOT upload to Drive, call Claude, or create documents/expenses —
 * it only returns the downloaded files to the backend caller.
 */
@Injectable()
export class GmailReaderService {
  private readonly logger = new Logger(GmailReaderService.name);

  constructor(
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly emailProvider: EmailProvider,
  ) {}

  /**
   * Streams the user's mailbox message by message: searches Gmail for `query`
   * (default: receipts heuristic), pages through the FULL result set via
   * nextPageToken, and yields each message's downloaded attachments as soon
   * as they are ready. Memory holds one message's attachments at a time, so
   * this is the entry point for large imports (initial import, nightly sync)
   * — callers import each yielded batch before pulling the next.
   *
   * `maxMessages` bounds the scan; omit it to scan every match.
   * Per-message failures are logged and yielded with failed=true — one broken
   * message never aborts the scan.
   *
   * `skipStats` (optional) collects EXPECTED attachment skips for the run's
   * single aggregated SKIPPED SUMMARY — passing it replaces the old per-skip
   * DEBUG lines. Bulk callers (initial import, nightly sync) supply one.
   * `pdfStats` (optional) does the same for the PDF-content fallback.
   */
  async *scanMessages(
    integration: UserIntegration,
    options: {
      query?: string;
      maxMessages?: number;
      skipStats?: SkippedAttachmentsAccumulator;
      pdfStats?: PdfContentScanAccumulator;
      isAlreadyImported?: (content: Buffer) => Promise<boolean>;
    } = {},
  ): AsyncGenerator<GmailMessageScanResult> {
    this.assertUsableIntegration(integration);
    const account = this.accountContext(integration);

    const query = options.query?.trim() || DEFAULT_GMAIL_QUERY;
    const maxMessages = options.maxMessages;
    this.logger.debug(
      `Gmail scan starting for integration=${integration.id} ` +
        `account=${integration.accountEmail ?? 'unknown'} query="${query}"` +
        (maxMessages ? ` maxMessages=${maxMessages}` : ''),
    );

    let pageToken: string | undefined;
    let scanned = 0;
    const aiBudget = { remaining: 10 };
    const seenPageTokens = new Set<string>();
    do {
      const remaining = maxMessages ? maxMessages - scanned : LIST_PAGE_SIZE;
      const page = await this.listMessagesPage(
        account,
        query,
        Math.min(LIST_PAGE_SIZE, remaining),
        pageToken,
      );
      pageToken = page.nextPageToken;
      if (pageToken && seenPageTokens.has(pageToken)) throw new EmailProviderError('CONTRACT');
      if (pageToken) seenPageTokens.add(pageToken);

      for (const messageId of page.ids) {
        scanned += 1;
        try {
          const collected = await this.collectMessageAttachments(
            account,
            messageId,
            options.skipStats,
            options.pdfStats,
            aiBudget,
            options.isAlreadyImported,
          );
          yield { messageId, failed: false, ...collected };
        } catch (error: any) {
          if (error instanceof EmailProviderError && error.category === 'AUTH') {
            throw error;
          }
          // One broken message must not fail the whole scan — contained,
          // counted (messagesFailed) and surfaced in the run's FINISH log.
          this.logger.warn(
            `Gmail sync stage=LOAD_MESSAGE failed for message ${messageId}: ` +
              `${error?.message ?? error}`,
          );
          yield {
            messageId,
            failed: true,
            attachments: [],
            skippedWithoutFilename: 0,
            skippedIrrelevant: 0,
            matchedByPdfContent: 0,
          };
        }
        if (maxMessages && scanned >= maxMessages) return;
      }
    } while (pageToken);
  }

  /**
   * Phase C test helper: scans up to `maxResults` (clamped 1–25) messages and
   * returns every attachment buffered in one result — fine at this size, NOT
   * for bulk imports (use scanMessages there).
   */
  async fetchAttachments(
    integration: UserIntegration,
    options: { query?: string; maxResults?: number } = {},
  ): Promise<GmailAttachmentsResult> {
    const query = options.query?.trim() || DEFAULT_GMAIL_QUERY;
    const maxMessages = Math.min(
      Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS),
      MAX_MAX_RESULTS,
    );

    const result: GmailAttachmentsResult = {
      query,
      messagesFound: 0,
      messagesWithAttachments: 0,
      attachmentsFound: 0,
      skippedWithoutFilename: 0,
      skippedIrrelevant: 0,
      matchedByPdfContent: 0,
      attachments: [],
    };

    // This helper has no orchestrator to emit the run summary, so it owns one.
    const pdfStats = new PdfContentScanAccumulator();

    for await (const scan of this.scanMessages(integration, { query, maxMessages, pdfStats })) {
      result.messagesFound += 1;
      result.skippedWithoutFilename += scan.skippedWithoutFilename;
      result.skippedIrrelevant += scan.skippedIrrelevant;
      result.matchedByPdfContent += scan.matchedByPdfContent;
      if (scan.attachments.length === 0) continue;

      result.messagesWithAttachments += 1;
      result.attachmentsFound += scan.attachments.length;
      result.attachments.push(...scan.attachments);

    }

    this.logger.debug(
      `Gmail scan complete for integration=${integration.id}: ` +
        `${result.messagesFound} messages, ${result.messagesWithAttachments} with attachments, ` +
        `${result.attachmentsFound} receipt candidates returned ` +
        `(${result.matchedByPdfContent} matched on PDF text), ` +
        `${result.skippedIrrelevant} irrelevant attachments skipped, ` +
        `${result.skippedWithoutFilename} parts skipped (no filename)`,
    );
    if (pdfStats.hasScans()) {
      this.logger.debug(pdfStats.format());
    }

    return result;
  }

  private assertUsableIntegration(integration: UserIntegration): void {
    if (integration.status !== IntegrationStatus.ACTIVE || integration.connectionBackend !== 'COMPOSIO' || !integration.connectedAccountId) {
      throw tagGmailSyncError(new BadRequestException('Reconnect the Gmail account.'), 'LOAD_INTEGRATION', false);
    }
  }

  private accountContext(integration: UserIntegration): EmailAccountContext {
    return { firebaseId: integration.firebaseId, connectedAccountId: integration.connectedAccountId, environment: process.env.COMPOSIO_ENVIRONMENT };
  }

  private async listMessagesPage(account: EmailAccountContext, query: string, maxResults: number, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
    return this.emailProvider.listMessages(account, query, maxResults, pageToken);
  }

  /**
   * Fetches one message, walks its MIME tree and downloads the attachments
   * that look like receipt/invoice documents (see isLikelyReceiptAttachment).
   */
  private async collectMessageAttachments(
    account: EmailAccountContext,
    messageId: string,
    skipStats?: SkippedAttachmentsAccumulator,
    pdfStats?: PdfContentScanAccumulator,
    aiBudget = { remaining: 10 },
    isAlreadyImported?: (content: Buffer) => Promise<boolean>,
  ): Promise<{
    attachments: GmailAttachmentFile[];
    skippedWithoutFilename: number;
    skippedIrrelevant: number;
    matchedByPdfContent: number;
    reviewRequired: number;
    aiReviewQueued: number;
  }> {
    const message = await this.emailProvider.getMessage(account, messageId);

    const header = (name: string): string | null =>
      message.payload?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? null;

    const parts: EmailPart[] = [];
    let skippedWithoutFilename = 0;
    const walk = (part: EmailPart | undefined, depth: number): void => {
      if (!part || depth > MAX_MIME_DEPTH) return;
      const hasBody = !!part.body?.attachmentId || !!part.body?.data;
      if (hasBody && part.filename) {
        parts.push(part);
      } else if (hasBody && part.body?.attachmentId && !part.filename) {
        skippedWithoutFilename += 1;
        // Expected skip — aggregated into the run's SKIPPED SUMMARY, not logged
        // per message. No filename to offer as an example, by definition.
        skipStats?.record(GmailSkipReason.MISSING_FILENAME);
      }
      for (const child of part.parts ?? []) {
        walk(child, depth + 1);
      }
    };
    walk(message.payload ?? undefined, 0);

    const subject = header('subject');
    // Gmail's short plaintext preview of the message body — the body signal
    // already available in this reader flow (no extra fetch/decoding needed).
    const snippet = message.snippet ?? null;
    const attachments: GmailAttachmentFile[] = [];
    let skippedIrrelevant = 0;
    let matchedByPdfContent = 0;
    let reviewRequired = 0;
    let aiReviewQueued = 0;
    // Expected skips are aggregated into the run's single SKIPPED SUMMARY
    // (see SkippedAttachmentsAccumulator) — never one log line per attachment,
    // which would flood production during a multi-year import.
    const skip = (filename: string, reason: GmailSkipReason): void => {
      skippedIrrelevant += 1;
      skipStats?.record(reason, filename);
    };

    for (const part of parts) {
      const filename = part.filename as string;

      // Stage 1 — metadata gate, before spending a download on it.
      const verdict = this.isLikelyReceiptAttachment(part, !!findKeywordMatchSource(filename, subject, snippet));
      if (!verdict.ok) {
        skip(filename, verdict.reason as GmailSkipReason);
        continue;
      }

      const ext = this.getExtension(filename);
      const metadataMatch = findKeywordMatchSource(filename, subject, snippet);
      if (ext !== 'pdf' && !metadataMatch && process.env.GMAIL_AI_REVIEW_ENABLED !== 'true') {
        reviewRequired++; skip(filename, GmailSkipReason.REVIEW_REQUIRED); continue;
      }
      const content = await this.downloadPartContent(account, messageId, part);
      if (!content) continue;
      if (ext === 'pdf' && !this.looksLikePdf(content)) { skip(filename, GmailSkipReason.PDF_INVALID); continue; }
      // Tiny images without any accounting signal remain obvious technical noise.
      if (ext !== 'pdf' && content.length < MIN_TECHNICAL_IMAGE_BYTES && !metadataMatch) { skip(filename, GmailSkipReason.IMAGE_TOO_SMALL); continue; }
      const extraction = ext === 'pdf' ? await extractPdfText(content, this.logger) : undefined;
      let matchedBy = metadataMatch;
      if (extraction && !metadataMatch) {
        if (extraction.outcome === 'EXTRACTED') {
          const matches = matchesAccountingDocumentKeyword(extraction.text);
          pdfStats?.record(matches ? GmailPdfScanOutcome.MATCHED : GmailPdfScanOutcome.NO_KEYWORD, filename);
          if (matches) { matchedBy = GmailKeywordMatchSource.PDF_CONTENT; matchedByPdfContent++; }
        } else pdfStats?.record(PDF_OUTCOME_TO_SCAN_OUTCOME[extraction.outcome], filename, extraction.error);
      }
      const alreadyImported = !matchedBy && process.env.GMAIL_AI_REVIEW_ENABLED === 'true'
        && !!isAlreadyImported && await isAlreadyImported(content);
      const decision = decideEmailIntake({ keyword: !!matchedBy, pdf: extraction, bytes: content.length,
        aiEnabled: process.env.GMAIL_AI_REVIEW_ENABLED === 'true', remaining: alreadyImported ? 1 : aiBudget.remaining });
      if (decision.kind === 'review_required') {
        if (extraction?.outcome === 'PASSWORD_REQUIRED' && process.env.PROTECTED_PDF_ENABLED === 'true') {
          matchedBy = GmailKeywordMatchSource.PASSWORD_REQUIRED;
        } else {
        reviewRequired++;
        // Kept in the source mailbox; importer persists an incomplete run and does not advance its cursor.
        skip(filename, GmailSkipReason.REVIEW_REQUIRED);
        continue;
        }
      }
      if (decision.kind === 'ai_review') {
        matchedBy = GmailKeywordMatchSource.AI_REVIEW;
        if (!alreadyImported) { aiBudget.remaining--; aiReviewQueued++; }
      }
      attachments.push({
        messageId,
        threadId: message.threadId ?? null,
        subject,
        from: header('from'),
        date: header('date'),
        attachmentId: part.body?.attachmentId ?? null,
        filename,
        mimeType: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg',
        size: content.length,
        matchedBy,
        content,
      });
    }

    return { attachments, skippedWithoutFilename, skippedIrrelevant, matchedByPdfContent, reviewRequired, aiReviewQueued };
  }

  /**
   * Metadata-level junk gate, run before downloading. Intentionally permissive:
   * it only drops obvious non-documents (email assets, tiny files, unsupported
   * types) — whether a candidate is truly a receipt is decided later by the
   * Claude analysis phase, so email subject and keywords play no role here.
   * PDFs: extension + size decide (mimeType is ignored, some providers send
   * PDFs as application/octet-stream). Images: not an inline asset and
   * substantial enough to be a scan/photo.
   */
  private isLikelyReceiptAttachment(
    part: EmailPart,
    metadataSignal = false,
  ): { ok: boolean; reason?: GmailSkipReason } {
    const filename = part.filename ?? '';
    const ext = this.getExtension(filename);

    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      return { ok: false, reason: GmailSkipReason.UNSUPPORTED_EXTENSION };
    }
    if (ASSET_NAME_PATTERN.test(filename) && !findKeywordMatchSource(filename, null, null)) {
      return { ok: false, reason: GmailSkipReason.ASSET_FILENAME };
    }

    // body.size is Gmail's decoded size estimate; 0/undefined means unknown —
    // in that case defer to the post-download size check.
    const declaredSize = part.body?.size ?? 0;

    if (ext === 'pdf') {
      if (declaredSize > 0 && declaredSize < 32) {
        return { ok: false, reason: GmailSkipReason.PDF_TOO_SMALL };
      }
      return { ok: true };
    }

    if (this.isInlineAsset(part)) {
      return { ok: false, reason: GmailSkipReason.INLINE_ASSET };
    }
    if (declaredSize > 0 && declaredSize < MIN_TECHNICAL_IMAGE_BYTES && !metadataSignal) {
      return { ok: false, reason: GmailSkipReason.IMAGE_TOO_SMALL };
    }
    return { ok: true };
  }

  /**
   * Inline email assets: embedded images referenced by the HTML body
   * (Content-Disposition: inline) or with mailer-generated names like
   * image001.png.
   */
  private isInlineAsset(part: EmailPart): boolean {
    const filename = (part.filename ?? '').toLowerCase();
    if (/^(image|inline|oleobject)\d+\.(png|jpe?g|gif|bmp)$/.test(filename)) {
      return true;
    }
    const disposition =
      part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition')?.value ?? '';
    return disposition.toLowerCase().trim().startsWith('inline');
  }

  private getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  }

  /** PDFs start with %PDF- (allow a little leading junk some generators add). */
  private looksLikePdf(content: Buffer): boolean {
    return content.subarray(0, 1024).includes('%PDF-');
  }

  /** Inline bytes and provider downloads share the existing filtering pipeline. */
  private async downloadPartContent(account: EmailAccountContext, messageId: string, part: EmailPart): Promise<Buffer> {
    if (part.body?.data) return Buffer.from(part.body.data, 'base64url');
    if (part.body?.attachmentId) {
      return this.emailProvider.downloadAttachment(account, messageId, part.body.attachmentId, part.filename || 'attachment');
    }
    // A declared attachment without retrievable content is a failed message, not a skip.
    throw new EmailProviderError('CONTRACT');
  }
}
