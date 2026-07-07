import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';
import { GoogleOauthService } from './google-oauth.service';
import { UserIntegrationsService } from './user-integrations.service';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Default Gmail search when the caller does not pass one. Deliberately broad:
 * the priority is to never miss a real receipt, so the search does NOT
 * require receipt/invoice keywords — junk is filtered per-attachment below,
 * and the real receipt-vs-not decision belongs to the Claude analysis phase.
 */
const DEFAULT_QUERY = 'has:attachment newer_than:90d';

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

/** Guard against pathological/malicious MIME nesting. */
const MAX_MIME_DEPTH = 20;

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
  attachments: GmailAttachmentFile[];
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
   * Searches the user's Gmail for messages matching `query` (default:
   * receipts heuristic) and downloads every named attachment.
   */
  async fetchAttachments(
    firebaseId: string,
    options: { query?: string; maxResults?: number } = {},
  ): Promise<GmailAttachmentsResult> {
    const integration = await this.getUsableIntegration(firebaseId);
    const gmail = await this.createGmailClient(integration);

    const query = options.query?.trim() || DEFAULT_QUERY;
    const maxResults = Math.min(
      Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS),
      MAX_MAX_RESULTS,
    );

    const messageIds = await this.searchMessages(gmail, query, maxResults);
    this.logger.log(
      `Gmail search for firebaseId=${firebaseId} query="${query}" found ${messageIds.length} message(s)`,
    );

    const result: GmailAttachmentsResult = {
      query,
      messagesFound: messageIds.length,
      messagesWithAttachments: 0,
      attachmentsFound: 0,
      skippedWithoutFilename: 0,
      skippedIrrelevant: 0,
      attachments: [],
    };

    for (const messageId of messageIds) {
      try {
        const collected = await this.collectMessageAttachments(gmail, messageId);
        result.skippedWithoutFilename += collected.skippedWithoutFilename;
        result.skippedIrrelevant += collected.skippedIrrelevant;
        if (collected.attachments.length === 0) {
          continue; // message has no usable attachments — skip it
        }
        result.messagesWithAttachments += 1;
        result.attachmentsFound += collected.attachments.length;
        result.attachments.push(...collected.attachments);

        // DEBUG ONLY — remove together with debugSaveToDisk() below.
        for (const attachment of collected.attachments) {
          await this.debugSaveToDisk(attachment.filename, attachment.content);
        }
      } catch (error: any) {
        // One broken message must not fail the whole scan.
        this.logger.error(
          `Failed to read Gmail message ${messageId}: ${error?.message ?? error}`,
        );
      }
    }

    this.logger.log(
      `Gmail scan complete for firebaseId=${firebaseId}: ` +
        `${result.messagesFound} messages, ${result.messagesWithAttachments} with attachments, ` +
        `${result.attachmentsFound} receipt candidates returned, ` +
        `${result.skippedIrrelevant} irrelevant attachments skipped, ` +
        `${result.skippedWithoutFilename} parts skipped (no filename)`,
    );

    return result;
  }

  /** Loads the user's Google integration and rejects unusable states clearly. */
  private async getUsableIntegration(firebaseId: string): Promise<UserIntegration> {
    const integration = await this.userIntegrationsService.findByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );

    if (!integration) {
      throw new NotFoundException(
        'No Google integration found for this user. Connect a Google account first.',
      );
    }
    if (integration.status !== IntegrationStatus.ACTIVE || !integration.refreshToken) {
      throw new BadRequestException(
        `Google integration is ${integration.status} — reconnect the Google account.`,
      );
    }
    if (!integration.scopes?.includes(GMAIL_READONLY_SCOPE)) {
      throw new BadRequestException(
        'The connected Google account did not grant Gmail read access. ' +
          'Disconnect and reconnect the account, approving Gmail access.',
      );
    }
    return integration;
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
        throw new BadRequestException(
          'Google authorization has expired or was revoked — reconnect the Google account.',
        );
      }
      throw new BadRequestException(`Google token refresh failed: ${reason}`);
    }

    return google.gmail({ version: 'v1', auth: client });
  }

  private async searchMessages(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number,
  ): Promise<string[]> {
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });
      return (response.data.messages ?? [])
        .map((m) => m.id)
        .filter((id): id is string => !!id);
    } catch (error: any) {
      const reason = error?.response?.data?.error?.message ?? error?.message ?? String(error);
      this.logger.error(`Gmail messages.list failed: ${reason}`);
      throw new BadRequestException(`Gmail search failed: ${reason}`);
    }
  }

  /**
   * Fetches one message, walks its MIME tree and downloads the attachments
   * that look like receipt/invoice documents (see isLikelyReceiptAttachment).
   */
  private async collectMessageAttachments(
    gmail: gmail_v1.Gmail,
    messageId: string,
  ): Promise<{
    attachments: GmailAttachmentFile[];
    skippedWithoutFilename: number;
    skippedIrrelevant: number;
  }> {
    const { data: message } = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

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
      }
      for (const child of part.parts ?? []) {
        walk(child, depth + 1);
      }
    };
    walk(message.payload ?? undefined, 0);

    if (skippedWithoutFilename > 0) {
      this.logger.log(
        `Message ${messageId}: skipped ${skippedWithoutFilename} attachment part(s) without filename`,
      );
    }

    const subject = header('subject');
    const attachments: GmailAttachmentFile[] = [];
    let skippedIrrelevant = 0;
    const skip = (filename: string, reason: string): void => {
      skippedIrrelevant += 1;
      this.logger.log(`Skipped attachment "${filename}" on message ${messageId}: ${reason}`);
    };

    for (const part of parts) {
      const filename = part.filename as string;

      // Stage 1 — metadata gate, before spending a download on it.
      const verdict = this.isLikelyReceiptAttachment(part);
      if (!verdict.ok) {
        skip(filename, verdict.reason ?? 'filtered');
        continue;
      }

      const content = await this.downloadPartContent(gmail, messageId, part);
      if (!content) continue;

      // Stage 2 — checks that need the actual bytes.
      const ext = this.getExtension(filename);
      if (ext === 'pdf') {
        if (content.length < MIN_PDF_BYTES) {
          skip(filename, `pdf too small (${content.length} bytes)`);
          continue;
        }
        if (!this.looksLikePdf(content)) {
          skip(filename, 'missing %PDF content signature');
          continue;
        }
      } else if (content.length < MIN_IMAGE_BYTES) {
        skip(filename, `image too small (${content.length} bytes)`);
        continue;
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
        content,
      });
    }

    return { attachments, skippedWithoutFilename, skippedIrrelevant };
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
  ): { ok: boolean; reason?: string } {
    const filename = part.filename ?? '';
    const ext = this.getExtension(filename);

    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      return { ok: false, reason: `unsupported extension "${ext || 'none'}"` };
    }
    if (ASSET_NAME_PATTERN.test(filename)) {
      return { ok: false, reason: 'asset-like filename (logo/icon/banner/signature/temp)' };
    }

    // body.size is Gmail's decoded size estimate; 0/undefined means unknown —
    // in that case defer to the post-download size check.
    const declaredSize = part.body?.size ?? 0;

    if (ext === 'pdf') {
      if (declaredSize > 0 && declaredSize < MIN_PDF_BYTES) {
        return { ok: false, reason: `pdf too small (declared ${declaredSize} bytes)` };
      }
      return { ok: true };
    }

    if (this.isInlineAsset(part)) {
      return { ok: false, reason: 'inline email asset' };
    }
    if (declaredSize > 0 && declaredSize < MIN_IMAGE_BYTES) {
      return { ok: false, reason: `image too small (declared ${declaredSize} bytes)` };
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
      this.logger.log(`Saved Gmail attachment: ${target}`);
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
        const { data } = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: part.body.attachmentId,
        });
        if (!data.data) {
          this.logger.warn(`Attachment ${part.filename} on message ${messageId} returned no data`);
          return null;
        }
        return Buffer.from(data.data, 'base64url');
      }
      return null;
    } catch (error: any) {
      this.logger.error(
        `Failed to download attachment "${part.filename}" from message ${messageId}: ` +
          `${error?.response?.data?.error?.message ?? error?.message ?? error}`,
      );
      return null;
    }
  }
}
