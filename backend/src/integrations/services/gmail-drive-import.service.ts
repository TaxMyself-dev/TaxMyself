import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DocumentImportService,
  DocumentImportStatus,
} from 'src/document-import/document-import.service';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
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
  skipped: number;
  /** Per-file detail; empty when the caller opted out (bulk imports). */
  files: GmailImportFileResult[];
}

/** One connected mailbox's outcome inside a user-level "import all" run. */
export interface GmailAccountImportResult {
  integrationId: number;
  accountEmail: string | null;
  imported: number;
  alreadyImported: number;
  skipped: number;
  attachmentsFound: number;
  messagesFound: number;
  messagesFailed: number;
  /** Non-null when this mailbox failed; the other mailboxes still run. */
  error: string | null;
}

/** Aggregate of a "import from all connected Gmail accounts" run. */
export interface GmailImportAllResult {
  totalImported: number;
  totalAlreadyImported: number;
  totalSkipped: number;
  totalAttachmentsFound: number;
  perAccount: GmailAccountImportResult[];
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
   * Imports from EVERY ACTIVE Gmail account the user has connected, isolating
   * each mailbox: one failing account is recorded in its perAccount.error and
   * never aborts the others. Dedup (firebaseId + businessNumber + contentHash)
   * runs in DocumentImportService, so the same file arriving in two mailboxes
   * is imported once.
   */
  async importAllForUser(
    firebaseId: string,
    options: { businessNumber?: string; query?: string; maxMessages?: number },
  ): Promise<GmailImportAllResult> {
    const integrations = await this.userIntegrationsService.findAllActiveByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );
    if (integrations.length === 0) {
      throw new BadRequestException(
        'No active Gmail accounts are connected. Connect a Gmail account first.',
      );
    }

    const aggregate: GmailImportAllResult = {
      totalImported: 0,
      totalAlreadyImported: 0,
      totalSkipped: 0,
      totalAttachmentsFound: 0,
      perAccount: [],
    };

    for (const integration of integrations) {
      const account: GmailAccountImportResult = {
        integrationId: integration.id,
        accountEmail: integration.accountEmail,
        imported: 0,
        alreadyImported: 0,
        skipped: 0,
        attachmentsFound: 0,
        messagesFound: 0,
        messagesFailed: 0,
        error: null,
      };
      try {
        const result = await this.importFromGmail(integration, {
          businessNumber: options.businessNumber,
          query: options.query,
          maxMessages: options.maxMessages,
          includeFileDetails: false,
        });
        account.imported = result.imported;
        account.alreadyImported = result.alreadyImported;
        account.skipped = result.skipped;
        account.attachmentsFound = result.attachmentsFound;
        account.messagesFound = result.messagesFound;
        account.messagesFailed = result.messagesFailed;
      } catch (error: any) {
        account.error = error?.message ?? String(error);
        this.logger.error(
          `Gmail import-all: account ${integration.accountEmail ?? 'unknown'} ` +
            `(integration ${integration.id}) failed: ${account.error}`,
        );
      }

      aggregate.totalImported += account.imported;
      aggregate.totalAlreadyImported += account.alreadyImported;
      aggregate.totalSkipped += account.skipped;
      aggregate.totalAttachmentsFound += account.attachmentsFound;
      aggregate.perAccount.push(account);
    }

    return aggregate;
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
      businessNumber?: string;
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
      skipped: 0,
      files: [],
    };

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

        // Per-attachment failures come back as status SKIPPED — importDocument
        // only throws for environment problems (business missing, Drive
        // unprovisioned), which rightly abort the whole request.
        let imported;
        try {
          imported = await this.documentImportService.importDocument({
            firebaseId,
            businessNumber: options.businessNumber,
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
        if (imported.status === 'IMPORTED') result.imported += 1;
        else if (imported.status === 'ALREADY_IMPORTED') result.alreadyImported += 1;
        else result.skipped += 1;
      }

      if (result.messagesFound % LOG_PROGRESS_EVERY_MESSAGES === 0) {
        this.logger.debug(
          `Gmail import progress for firebaseId=${firebaseId}: ` +
            `${result.messagesFound} messages scanned, ${result.imported} imported so far`,
        );
      }
    }

    // DEBUG only — the run-level INFO summary (with sync type, integration id
    // and duration) is logged once by the orchestrator (GmailSyncService).
    this.logger.debug(
      `Gmail import for firebaseId=${firebaseId} business=${options.businessNumber ?? 'auto-resolved'}: ` +
        `${result.imported} imported, ${result.alreadyImported} already imported, ` +
        `${result.skipped} skipped (of ${result.attachmentsFound} candidates, ` +
        `${result.messagesFound} messages, ${result.messagesFailed} failed)`,
    );
    return result;
  }
}
