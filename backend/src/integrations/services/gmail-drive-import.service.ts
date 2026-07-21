import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DocumentImportDestination,
  DocumentImportService,
  DocumentImportStatus,
} from 'src/document-import/document-import.service';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import {
  buildGmailImportSummary,
  GmailImportAccountSummary,
  GmailImportErrorCode,
  GmailImportSummary,
} from '../dto/gmail-import-summary';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationProvider } from '../enums/integrations.enums';
import {
  SkippedAttachmentsAccumulator,
  tagGmailSyncError,
} from '../utils/gmail-sync-logging.util';
import { DEFAULT_GMAIL_QUERY, GmailReaderService } from './gmail-reader.service';
import { UserIntegrationsService } from './user-integrations.service';

/** Progress heartbeat interval for long scans (initial import can span years). */
const LOG_PROGRESS_EVERY_MESSAGES = 100;

/** How many failed message ids to keep for the run's FINISH/troubleshooting log. */
const MAX_FAILED_MESSAGE_IDS = 5;

export interface GmailImportFileResult {
  messageId: string;
  threadId: string | null;
  attachmentId: string | null;
  originalFilename: string;
  driveFileId: string | null;
  driveFileName: string | null;
  status: DocumentImportStatus;
  reason: string | null;
}

export interface GmailImportResult {
  query: string;
  messagesFound: number;
  /** Messages that could not be fetched/parsed (logged and skipped by the reader). */
  messagesFailed: number;
  /** First few failed Gmail message ids, for troubleshooting logs. */
  failedMessageIds: string[];
  attachmentsFound: number;
  imported: number;
  alreadyImported: number;
  /** Per-file import failures (Drive upload / ledger insert). */
  failedFiles: number;
  /**
   * The businesses these documents were stored under, as reported by the
   * import pipeline itself (never re-resolved here). Distinct, first-seen
   * order; empty when the scan handled no attachment.
   */
  destinations: DocumentImportDestination[];
  /** Per-file detail; empty when the caller opted out (bulk imports). */
  files: GmailImportFileResult[];
}

/** One mailbox's outcome plus the destinations its documents actually reached. */
export interface GmailAccountImportOutcome {
  summary: GmailImportAccountSummary;
  destinations: DocumentImportDestination[];
}

/**
 * Phase D — Gmail intake adapter. Deliberately thin: it only reads attachment
 * candidates via GmailReaderService and hands each one to the shared
 * DocumentImportService pipeline, which owns everything generic (hashing,
 * dedup, Drive inbox upload, the imported_documents ledger).
 * No Gmail-specific import logic belongs anywhere else; no import logic
 * belongs here.
 */
@Injectable()
export class GmailDriveImportService {
  private readonly logger = new Logger(GmailDriveImportService.name);

  constructor(
    private readonly gmailReaderService: GmailReaderService,
    private readonly documentImportService: DocumentImportService,
    private readonly userIntegrationsService: UserIntegrationsService,
  ) {}

  /**
   * Imports from the SELECTED ACTIVE Gmail accounts of the user (the manual
   * import dialog sends the chosen integration ids), isolating each mailbox:
   * one failing account is recorded in its perAccount.error and never aborts
   * the others. Every requested id must be an ACTIVE Google integration owned
   * by the caller that already completed its initial import (manual pulls are
   * a top-up on top of the initial range, not a replacement for it) —
   * otherwise the whole request is rejected before any import starts.
   * Dedup (firebaseId + businessNumber + contentHash) runs in
   * DocumentImportService, so the same file arriving in two mailboxes is
   * imported once.
   *
   * The target business is NOT chosen here and cannot be influenced by the
   * caller: the import pipeline resolves it per document and reports it back,
   * and the summary's destinations are collected from those real results.
   */
  async importAllForUser(
    firebaseId: string,
    integrationIds: number[],
    options: { query?: string; maxMessages?: number } = {},
  ): Promise<GmailImportSummary> {
    const activeIntegrations =
      await this.userIntegrationsService.findAllActiveByUserAndProvider(
        firebaseId,
        IntegrationProvider.GOOGLE,
      );

    // 404 (not 403) for foreign/EXPIRED/unknown ids alike — a foreign id must
    // not leak that the integration exists (findOwnedByIdOrThrow philosophy).
    const activeIds = new Set(activeIntegrations.map((i) => i.id));
    const uniqueIds = [...new Set(integrationIds)];
    const invalidIds = uniqueIds.filter((id) => !activeIds.has(id));
    if (invalidIds.length > 0) {
      throw new NotFoundException(
        `Gmail integrations not found or not active: ${invalidIds.join(', ')}`,
      );
    }

    // Business rule enforced server-side, not only in the dialog: manual
    // import is available only after the account's one-time initial import
    // (same initialImportCompletedAt gate as the nightly incremental sync).
    const readyIds = new Set(
      activeIntegrations.filter((i) => i.initialImportCompletedAt).map((i) => i.id),
    );
    const notReadyIds = uniqueIds.filter((id) => !readyIds.has(id));
    if (notReadyIds.length > 0) {
      throw new BadRequestException(
        `Gmail integrations have not completed their initial import: ${notReadyIds.join(', ')}`,
      );
    }

    const requestedIds = new Set(integrationIds);
    const integrations = activeIntegrations.filter((i) => requestedIds.has(i.id));

    const summaries: GmailImportAccountSummary[] = [];
    const destinations: DocumentImportDestination[] = [];

    for (const integration of integrations) {
      const outcome = await this.importAccount(integration, options);
      summaries.push(outcome.summary);
      destinations.push(...outcome.destinations);
    }

    return buildGmailImportSummary('MANUAL', summaries, destinations);
  }

  /**
   * One mailbox, one user-facing outcome — the unit both the manual pull and
   * the background initial import are built from, so the two flows can never
   * count or classify anything differently.
   *
   * Never throws: a mailbox that fails mid-run is reported through
   * `summary.errorCode` (the exception itself is logged here and nowhere near
   * the response), and the counts it produced before failing are kept.
   */
  async importAccount(
    integration: UserIntegration,
    options: {
      query?: string;
      maxMessages?: number;
      /** Pass one in to also emit the aggregated SKIPPED SUMMARY log. */
      skipStats?: SkippedAttachmentsAccumulator;
    } = {},
  ): Promise<GmailAccountImportOutcome> {
    const summary: GmailImportAccountSummary = {
      integrationId: integration.id,
      accountEmail: integration.accountEmail,
      imported: 0,
      alreadyImported: 0,
      skippedIrrelevant: 0,
      failed: 0,
      errorCode: null,
    };
    // The reader's expected skips (logos, non-invoice files) are otherwise
    // log-only, and the user is owed that number.
    const skipStats = options.skipStats ?? new SkippedAttachmentsAccumulator();
    let destinations: DocumentImportDestination[] = [];

    try {
      const result = await this.importFromGmail(integration, {
        query: options.query,
        maxMessages: options.maxMessages,
        includeFileDetails: false,
        skipStats,
      });
      summary.imported = result.imported;
      summary.alreadyImported = result.alreadyImported;
      // Files that could not be stored + messages that could not be read.
      // Duplicates and deliberate skips are counted elsewhere, never here.
      summary.failed = result.failedFiles + result.messagesFailed;
      destinations = result.destinations;
    } catch (error: any) {
      summary.errorCode = this.classifyAccountError(error);
      this.logger.error(
        `Gmail import: account ${integration.accountEmail ?? 'unknown'} ` +
          `(integration ${integration.id}) failed: ${error?.message ?? error}`,
      );
    }

    // Recorded whether the account succeeded or failed mid-run: attachments
    // skipped before the failure were still legitimately skipped.
    summary.skippedIrrelevant = skipStats.totalSkipped;
    return { summary, destinations };
  }

  /**
   * Collapses an exception into the coarse reason the UI can phrase. The
   * message itself never leaves the server — it is logged (and, for background
   * runs, persisted to lastSyncError) for support to read.
   */
  private classifyAccountError(error: any): GmailImportErrorCode {
    const message = String(error?.message ?? error);
    return /invalid_grant|unauthorized|expired|revoked|reconnect/i.test(message)
      ? 'ACCOUNT_NEEDS_RECONNECT'
      : 'IMPORT_FAILED';
  }

  /**
   * Scans Gmail and imports each message's attachments as they stream in —
   * memory never holds more than one message's files, so this is safe for
   * bulk runs (initial import, nightly sync) as well as the small manual scan.
   *
   * `maxMessages` bounds the scan (omit for unlimited — the reader pages
   * through the full result set). `includeFileDetails: false` skips the
   * per-file result list, which nobody reads on background bulk runs.
   *
   * `skipStats` (optional) collects EXPECTED attachment skips so the caller
   * (the sync orchestrator) can emit one aggregated SKIPPED SUMMARY at FINISH
   * instead of a DEBUG line per skipped attachment.
   */
  async importFromGmail(
    integration: UserIntegration,
    options: {
      query?: string;
      maxMessages?: number;
      includeFileDetails?: boolean;
      skipStats?: SkippedAttachmentsAccumulator;
    },
  ): Promise<GmailImportResult> {
    const firebaseId = integration.firebaseId;
    const query = options.query?.trim() || DEFAULT_GMAIL_QUERY;
    const includeFileDetails = options.includeFileDetails ?? true;

    const result: GmailImportResult = {
      query,
      messagesFound: 0,
      messagesFailed: 0,
      failedMessageIds: [],
      attachmentsFound: 0,
      imported: 0,
      alreadyImported: 0,
      failedFiles: 0,
      destinations: [],
      files: [],
    };
    // Keyed by business number so the same destination reported by hundreds of
    // documents is recorded once, in first-seen order.
    const destinationsSeen = new Map<string, DocumentImportDestination>();

    // Integration/token errors (not connected, expired, revoked) bubble up
    // from the reader with clear messages; junk filtering happens there too.
    for await (const scan of this.gmailReaderService.scanMessages(integration, {
      query,
      maxMessages: options.maxMessages,
      skipStats: options.skipStats,
    })) {
      result.messagesFound += 1;
      if (scan.failed) {
        result.messagesFailed += 1;
        if (result.failedMessageIds.length < MAX_FAILED_MESSAGE_IDS) {
          result.failedMessageIds.push(scan.messageId);
        }
        continue;
      }

      for (const attachment of scan.attachments) {
        result.attachmentsFound += 1;

        // Per-attachment failures come back as status FAILED — importDocument
        // only throws for environment problems (business missing, Drive
        // unprovisioned), which rightly abort the whole request.
        //
        // No businessNumber is passed: the pipeline resolves the destination
        // itself and hands it back on the result. This adapter must not have
        // an opinion about which business a document belongs to.
        let imported;
        try {
          imported = await this.documentImportService.importDocument({
            firebaseId,
            source: DocumentImportSource.GMAIL,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            content: attachment.content,
            metadata: {
              gmailMessageId: attachment.messageId,
              gmailThreadId: attachment.threadId,
              gmailAttachmentId: attachment.attachmentId,
              gmailSubject: attachment.subject,
              gmailFrom: attachment.from,
              gmailDate: attachment.date,
            },
          });
        } catch (error) {
          // Stage tag only — behavior (abort the run) is unchanged.
          throw tagGmailSyncError(error, 'START_DOCUMENT_IMPORT', false);
        }

        if (includeFileDetails) {
          result.files.push({
            messageId: attachment.messageId,
            threadId: attachment.threadId,
            attachmentId: attachment.attachmentId,
            originalFilename: attachment.filename,
            driveFileId: imported.driveFileId,
            driveFileName: imported.driveFileName,
            status: imported.status,
            reason: imported.reason,
          });
        }
        // Recorded for EVERY outcome: the destination is where this document
        // is (or already was) stored, which is exactly what the user is told.
        const { businessNumber } = imported.destination;
        if (!destinationsSeen.has(businessNumber)) {
          destinationsSeen.set(businessNumber, imported.destination);
        }

        if (imported.status === 'IMPORTED') result.imported += 1;
        else if (imported.status === 'ALREADY_IMPORTED') result.alreadyImported += 1;
        else result.failedFiles += 1;
      }

      if (result.messagesFound % LOG_PROGRESS_EVERY_MESSAGES === 0) {
        this.logger.debug(
          `Gmail import progress for firebaseId=${firebaseId}: ` +
            `${result.messagesFound} messages scanned, ${result.imported} imported so far`,
        );
      }
    }

    result.destinations = [...destinationsSeen.values()];

    // DEBUG only — the run-level INFO summary (with sync type, integration id
    // and duration) is logged once by the orchestrator (GmailSyncService).
    this.logger.debug(
      `Gmail import for firebaseId=${firebaseId} ` +
        `business=${result.destinations.map((d) => d.businessNumber).join(',') || 'none'}: ` +
        `${result.imported} imported, ${result.alreadyImported} already imported, ` +
        `${result.failedFiles} failed files (of ${result.attachmentsFound} candidates, ` +
        `${result.messagesFound} messages, ${result.messagesFailed} failed)`,
    );
    return result;
  }
}
