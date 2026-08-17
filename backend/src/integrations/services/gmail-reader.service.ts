import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
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
import { GoogleOauthService } from './google-oauth.service';
import { UserIntegrationsService } from './user-integrations.service';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

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
const ASSET_NAME_PATTERN = /(logo|icon|banner|signature|templogo|temp)/i;

/** PDFs below this are unlikely to be real documents (empty/broken). */
const MIN_PDF_BYTES = 20 * 1024;
/**
 * Images need to be substantial to be a scanned/photographed receipt —
 * this also drops tiny logos, tracking pixels and signature images.
 */
const MIN_IMAGE_BYTES = 80 * 1024;

/** contentBase64 responses get large fast — keep the page size modest. */
const DEFAULT_MAX_RESULTS = 10;
const MAX_MAX_RESULTS = 25;

/** messages.list page size — 500 is the Gmail API maximum. */
const LIST_PAGE_SIZE = 500;

/** Backoff schedule for rate-limited/transient Gmail API failures. */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Guard against pathological/malicious MIME nesting. */
const MAX_MIME_DEPTH = 20;

/** Extraction outcomes that end the PDF-content fallback without a match. */
const PDF_OUTCOME_TO_SCAN_OUTCOME: Record<
  Exclude<PdfTextExtractionOutcome, 'EXTRACTED'>,
  GmailPdfScanOutcome
> = {
  NO_TEXT: GmailPdfScanOutcome.NO_TEXT,
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
    private readonly googleOauthService: GoogleOauthService,
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
    } = {},
  ): AsyncGenerator<GmailMessageScanResult> {
    this.assertUsableIntegration(integration);
    const gmail = await this.createGmailClient(integration);

    const query = options.query?.trim() || DEFAULT_GMAIL_QUERY;
    const maxMessages = options.maxMessages;
    this.logger.debug(
      `Gmail scan starting for integration=${integration.id} ` +
        `account=${integration.accountEmail ?? 'unknown'} query="${query}"` +
        (maxMessages ? ` maxMessages=${maxMessages}` : ''),
    );

    let pageToken: string | undefined;
    let scanned = 0;
    do {
      const remaining = maxMessages ? maxMessages - scanned : LIST_PAGE_SIZE;
      const page = await this.listMessagesPage(
        gmail,
        query,
        Math.min(LIST_PAGE_SIZE, remaining),
        pageToken,
      );
      pageToken = page.nextPageToken;

      for (const messageId of page.ids) {
        scanned += 1;
        try {
          const collected = await this.collectMessageAttachments(
            gmail,
            messageId,
            options.skipStats,
            options.pdfStats,
          );
          yield { messageId, failed: false, ...collected };
        } catch (error: any) {
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

      // DEBUG ONLY — remove together with debugSaveToDisk() below.
      for (const attachment of scan.attachments) {
        await this.debugSaveToDisk(attachment.filename, attachment.content);
      }
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

  /** Rejects unusable integration states clearly before any Gmail call. */
  private assertUsableIntegration(integration: UserIntegration): void {
    // All these states need the user to (re-)connect — retrying won't help.
    if (integration.status !== IntegrationStatus.ACTIVE || !integration.refreshToken) {
      throw tagGmailSyncError(
        new BadRequestException(
          `Google integration is ${integration.status} — reconnect the Google account.`,
        ),
        'LOAD_INTEGRATION',
        false,
      );
    }
    if (!integration.scopes?.includes(GMAIL_READONLY_SCOPE)) {
      throw tagGmailSyncError(
        new BadRequestException(
          'The connected Google account did not grant Gmail read access. ' +
            'Disconnect and reconnect the account, approving Gmail access.',
        ),
        'LOAD_INTEGRATION',
        false,
      );
    }
  }

  /**
   * Builds an authorized Gmail client. Forces a token refresh up front so an
   * expired grant is detected here (integration marked EXPIRED) instead of
   * surfacing as an opaque mid-scan failure. Refreshed access tokens are
   * persisted back onto the integration as a cache.
   */
  private async createGmailClient(integration: UserIntegration): Promise<gmail_v1.Gmail> {
    const refreshToken = this.userIntegrationsService.getDecryptedRefreshToken(integration);
    const client = this.googleOauthService.createClientWithTokens(refreshToken);

    try {
      const { token } = await client.getAccessToken();
      if (token) {
        const expiryDate = (client.credentials.expiry_date as number | undefined) ?? null;
        await this.userIntegrationsService.updateTokens(integration.id, {
          accessToken: token,
          expiresAt: expiryDate ? new Date(expiryDate) : null,
        });
      }
    } catch (error: any) {
      const reason = error?.response?.data?.error ?? error?.message ?? String(error);
      this.logger.error(
        `Google token refresh failed for integration ${integration.id}: ${reason}`,
      );
      if (String(reason).includes('invalid_grant')) {
        // The refresh token is dead (revoked at Google / expired) — record it.
        await this.userIntegrationsService.updateStatus(
          integration.id,
          IntegrationStatus.EXPIRED,
        );
        throw tagGmailSyncError(
          new BadRequestException(
            'Google authorization has expired or was revoked — reconnect the Google account.',
          ),
          'TOKEN_REFRESH',
          false, // dead grant — only a user reconnect fixes it
        );
      }
      throw tagGmailSyncError(
        new BadRequestException(`Google token refresh failed: ${reason}`),
        'TOKEN_REFRESH',
      );
    }

    return google.gmail({ version: 'v1', auth: client });
  }

  /** One messages.list page. nextPageToken is undefined on the last page. */
  private async listMessagesPage(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number,
    pageToken: string | undefined,
  ): Promise<{ ids: string[]; nextPageToken?: string }> {
    try {
      const response = await this.withRetry(
        () => gmail.users.messages.list({ userId: 'me', q: query, maxResults, pageToken }),
        'messages.list',
      );
      return {
        ids: (response.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => !!id),
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error: any) {
      const status = Number(error?.response?.status ?? error?.code);
      const reason = error?.response?.data?.error?.message ?? error?.message ?? String(error);
      this.logger.error(`Gmail messages.list failed: ${reason}`);
      throw tagGmailSyncError(
        new BadRequestException(`Gmail search failed: ${reason}`),
        'SEARCH_MESSAGES',
        // Rate limits / transient 5xx exhausted the backoff — a later run succeeds.
        status === 429 || (status >= 500 && status < 600) ? true : undefined,
      );
    }
  }

  /**
   * Retries rate-limited (429) and transient (5xx) Gmail API failures with
   * exponential backoff. Long scans make hundreds of calls, so a burst limit
   * hit must slow the scan down, not lose the message.
   */
  private async withRetry<T>(call: () => Promise<T>, label: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (error: any) {
        const status = Number(error?.response?.status ?? error?.code);
        const retryable = status === 429 || (status >= 500 && status < 600);
        if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw error;
        this.logger.warn(
          `Gmail ${label} returned ${status} — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} ` +
            `in ${RETRY_DELAYS_MS[attempt]}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  /**
   * Fetches one message, walks its MIME tree and downloads the attachments
   * that look like receipt/invoice documents (see isLikelyReceiptAttachment).
   */
  private async collectMessageAttachments(
    gmail: gmail_v1.Gmail,
    messageId: string,
    skipStats?: SkippedAttachmentsAccumulator,
    pdfStats?: PdfContentScanAccumulator,
  ): Promise<{
    attachments: GmailAttachmentFile[];
    skippedWithoutFilename: number;
    skippedIrrelevant: number;
    matchedByPdfContent: number;
  }> {
    const { data: message } = await this.withRetry(
      () => gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' }),
      'messages.get',
    );

    const header = (name: string): string | null =>
      message.payload?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? null;

    const parts: gmail_v1.Schema$MessagePart[] = [];
    let skippedWithoutFilename = 0;
    const walk = (part: gmail_v1.Schema$MessagePart | undefined, depth: number): void => {
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
      const verdict = this.isLikelyReceiptAttachment(part);
      if (!verdict.ok) {
        skip(filename, verdict.reason as GmailSkipReason);
        continue;
      }

      // Stage 1b — accounting-document keyword in the filename, subject or
      // body snippet. Still decided before any download, so a non-PDF that
      // nothing points at never reaches the network or the Drive upload.
      const ext = this.getExtension(filename);
      const metadataMatch = findKeywordMatchSource(filename, subject, snippet);
      if (!metadataMatch && ext !== 'pdf') {
        skip(filename, GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
        continue;
      }

      // A PDF with no metadata signal is downloaded ONCE here and gets a
      // second chance from its own text further down — the bytes are needed
      // for the import anyway, so nothing is fetched twice.
      const content = await this.downloadPartContent(gmail, messageId, part);
      if (!content) continue;

      // Stage 2 — deterministic technical checks that need the actual bytes.
      // These run BEFORE any text extraction: a too-small or non-PDF payload
      // is skipped on its technical merits, exactly as before.
      if (ext === 'pdf') {
        if (content.length < MIN_PDF_BYTES) {
          skip(filename, GmailSkipReason.PDF_TOO_SMALL);
          continue;
        }
        if (!this.looksLikePdf(content)) {
          skip(filename, GmailSkipReason.PDF_INVALID);
          continue;
        }
      } else if (content.length < MIN_IMAGE_BYTES) {
        skip(filename, GmailSkipReason.IMAGE_TOO_SMALL);
        continue;
      }

      // Stage 3 — last resort for a technically valid PDF nothing else
      // pointed at: look for the same keywords inside its own text. Any
      // failure here (scanned, encrypted, malformed, too large) falls back to
      // the pre-existing skip, never to an exception.
      let matchedBy = metadataMatch;
      if (!matchedBy) {
        matchedBy = await this.matchPdfContent(filename, content, pdfStats);
        if (!matchedBy) {
          skip(filename, GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
          continue;
        }
        matchedByPdfContent += 1;
      }

      attachments.push({
        messageId,
        threadId: message.threadId ?? null,
        subject,
        from: header('from'),
        date: header('date'),
        attachmentId: part.body?.attachmentId ?? null,
        filename,
        mimeType: part.mimeType ?? null,
        size: content.length,
        matchedBy,
        content,
      });
    }

    return { attachments, skippedWithoutFilename, skippedIrrelevant, matchedByPdfContent };
  }

  /**
   * Extracts text from an already-downloaded, already-validated PDF and looks
   * for an accounting-document keyword in it. Returns 'pdf-content' on a hit
   * and null for every other outcome (no keyword, no text layer, oversized,
   * unreadable, extractor unavailable) — the caller then applies the existing
   * skip. Outcomes are tallied for the run's PDF CONTENT SCAN summary; the
   * extracted text itself is never logged or persisted.
   */
  private async matchPdfContent(
    filename: string,
    content: Buffer,
    pdfStats?: PdfContentScanAccumulator,
  ): Promise<GmailKeywordMatchSource | null> {
    const extraction = await extractPdfText(content, this.logger);

    if (extraction.outcome !== 'EXTRACTED') {
      pdfStats?.record(
        PDF_OUTCOME_TO_SCAN_OUTCOME[extraction.outcome],
        filename,
        extraction.error,
      );
      return null;
    }

    if (!matchesAccountingDocumentKeyword(extraction.text)) {
      pdfStats?.record(GmailPdfScanOutcome.NO_KEYWORD, filename);
      return null;
    }

    pdfStats?.record(GmailPdfScanOutcome.MATCHED, filename);
    return GmailKeywordMatchSource.PDF_CONTENT;
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
    part: gmail_v1.Schema$MessagePart,
  ): { ok: boolean; reason?: GmailSkipReason } {
    const filename = part.filename ?? '';
    const ext = this.getExtension(filename);

    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      return { ok: false, reason: GmailSkipReason.UNSUPPORTED_EXTENSION };
    }
    if (ASSET_NAME_PATTERN.test(filename)) {
      return { ok: false, reason: GmailSkipReason.ASSET_FILENAME };
    }

    // body.size is Gmail's decoded size estimate; 0/undefined means unknown —
    // in that case defer to the post-download size check.
    const declaredSize = part.body?.size ?? 0;

    if (ext === 'pdf') {
      if (declaredSize > 0 && declaredSize < MIN_PDF_BYTES) {
        return { ok: false, reason: GmailSkipReason.PDF_TOO_SMALL };
      }
      return { ok: true };
    }

    if (this.isInlineAsset(part)) {
      return { ok: false, reason: GmailSkipReason.INLINE_ASSET };
    }
    if (declaredSize > 0 && declaredSize < MIN_IMAGE_BYTES) {
      return { ok: false, reason: GmailSkipReason.IMAGE_TOO_SMALL };
    }
    return { ok: true };
  }

  /**
   * Inline email assets: embedded images referenced by the HTML body
   * (Content-Disposition: inline) or with mailer-generated names like
   * image001.png.
   */
  private isInlineAsset(part: gmail_v1.Schema$MessagePart): boolean {
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

  /**
   * DEBUG ONLY — writes a downloaded attachment to backend/debug-imports/ so
   * the files can be inspected manually. Preserves the original filename;
   * name collisions get an " (1)", " (2)", ... suffix instead of overwriting.
   * Never throws — a disk problem must not affect the Gmail scan. Delete this
   * method and its single call site in fetchAttachments() to remove the feature.
   */
  private async debugSaveToDisk(filename: string, content: Buffer): Promise<void> {
    try {
      const dir = path.join(process.cwd(), 'debug-imports');
      await fs.promises.mkdir(dir, { recursive: true });

      // Keep only the basename and strip characters Windows rejects.
      const safeName =
        path.basename(filename).replace(/[\\/:*?"<>|]/g, '_').trim() || 'attachment';
      const ext = path.extname(safeName);
      const stem = safeName.slice(0, safeName.length - ext.length);

      let target = path.join(dir, safeName);
      for (let i = 1; fs.existsSync(target); i++) {
        target = path.join(dir, `${stem} (${i})${ext}`);
      }

      await fs.promises.writeFile(target, content);
      this.logger.debug(`Saved Gmail attachment: ${target}`);
    } catch (error: any) {
      this.logger.warn(
        `DEBUG save of Gmail attachment "${filename}" failed: ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Downloads a single attachment part. Small attachments arrive inline in
   * body.data; larger ones require attachments.get. Gmail returns base64url
   * either way. Returns null (and logs) on failure instead of throwing so one
   * bad attachment doesn't sink the message.
   */
  private async downloadPartContent(
    gmail: gmail_v1.Gmail,
    messageId: string,
    part: gmail_v1.Schema$MessagePart,
  ): Promise<Buffer | null> {
    try {
      if (part.body?.data) {
        return Buffer.from(part.body.data, 'base64url');
      }
      if (part.body?.attachmentId) {
        const attachmentId = part.body.attachmentId;
        const { data } = await this.withRetry(
          () =>
            gmail.users.messages.attachments.get({
              userId: 'me',
              messageId,
              id: attachmentId,
            }),
          'attachments.get',
        );
        if (!data.data) {
          this.logger.warn(`Attachment ${part.filename} on message ${messageId} returned no data`);
          return null;
        }
        return Buffer.from(data.data, 'base64url');
      }
      return null;
    } catch (error: any) {
      // Contained per-attachment failure — the message's other files continue.
      this.logger.warn(
        `Gmail sync stage=DOWNLOAD_ATTACHMENT failed for "${part.filename}" ` +
          `(message ${messageId}, attachmentId=${part.body?.attachmentId ?? 'inline'}): ` +
          `${error?.response?.data?.error?.message ?? error?.message ?? error}`,
      );
      return null;
    }
  }
}
