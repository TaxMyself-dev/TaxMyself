import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentImportService,
  DocumentImportStatus,
} from 'src/document-import/document-import.service';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import { GmailReaderService } from './gmail-reader.service';

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
  attachmentsFound: number;
  imported: number;
  alreadyImported: number;
  skipped: number;
  files: GmailImportFileResult[];
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
  ) {}

  async importFromGmail(
    firebaseId: string,
    options: { businessNumber: string; query?: string; maxResults?: number },
  ): Promise<GmailImportResult> {
    // Integration/token errors (not connected, expired, revoked) bubble up
    // from the reader with clear messages; junk filtering happens there too.
    const scan = await this.gmailReaderService.fetchAttachments(firebaseId, {
      query: options.query,
      maxResults: options.maxResults,
    });

    const result: GmailImportResult = {
      query: scan.query,
      messagesFound: scan.messagesFound,
      attachmentsFound: scan.attachmentsFound,
      imported: 0,
      alreadyImported: 0,
      skipped: 0,
      files: [],
    };

    for (const attachment of scan.attachments) {
      // Per-attachment failures come back as status SKIPPED — importDocument
      // only throws for environment problems (business missing, Drive
      // unprovisioned), which rightly abort the whole request.
      const imported = await this.documentImportService.importDocument({
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
      if (imported.status === 'IMPORTED') result.imported += 1;
      else if (imported.status === 'ALREADY_IMPORTED') result.alreadyImported += 1;
      else result.skipped += 1;
    }

    this.logger.log(
      `Gmail import for firebaseId=${firebaseId} business=${options.businessNumber}: ` +
        `${result.imported} imported, ${result.alreadyImported} already imported, ` +
        `${result.skipped} skipped (of ${result.attachmentsFound} candidates)`,
    );
    return result;
  }
}
