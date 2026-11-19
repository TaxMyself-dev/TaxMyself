import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { ProtectedPdfService } from './protected-pdf.service';
import { ProtectedPdfStore, ReplacementOperation } from './protected-pdf.store';
import { GoogleDriveService } from '../google-drive/google-drive.service';

@Injectable()
export class ProtectedPdfWorker {
  private readonly logger = new Logger(ProtectedPdfWorker.name);
  constructor(
    private readonly service: ProtectedPdfService,
    private readonly store: ProtectedPdfStore,
    private readonly drive: GoogleDriveService,
  ) {}
  @Cron('*/30 * * * * *', { name: 'protectedPdfOutbox' })
  async tick(): Promise<void> {
    if (
      !this.service.enabled() ||
      process.env.PROTECTED_PDF_DISPATCH_ENABLED !== 'true'
    )
      return;
    await this.recoverAbandonedUploads();
    // Bounded batch; every delivery gets a DB lease and an ownership/version recheck.
    const due: ReplacementOperation[] = await this.store.query(
      "SELECT * FROM document_replacement_operations WHERE ((status IN ('PENDING','DELIVERY_FAILED') AND attempts<5 AND next_attempt_at<=UTC_TIMESTAMP(3)) OR (status='DISPATCHING' AND lease_expires_at<UTC_TIMESTAMP(3))) ORDER BY created_at LIMIT 5",
    );
    for (const op of due)
      await this.deliver(op.id).catch(() =>
        this.logger.warn('Protected PDF delivery retained for retry'),
      );
    await this.reconcile();
  }
  async deliver(id: string): Promise<void> {
    if (
      !this.service.enabled() ||
      process.env.PROTECTED_PDF_DISPATCH_ENABLED !== 'true'
    )
      return;
    const token = randomUUID();
    const initial = await this.store.operation(id);
    if (!initial) return;
    const operation = await this.store.transaction(async (manager) => {
      // Same lock order as upload/retry: root first, then operation.
      const root = await this.store.root(
        initial.protected_id,
        initial.firebase_id,
        initial.business_number,
        manager,
        true,
      );
      const op = await this.store.operation(id, manager, true);
      if (
        !op ||
        !['PENDING', 'DELIVERY_FAILED', 'DISPATCHING'].includes(op.status)
      )
        return null;
      if (
        op.status === 'DISPATCHING' &&
        new Date(op.lease_expires_at).getTime() > Date.now()
      )
        return null;
      if (op.attempts >= 5) {
        await this.store.query(
          "UPDATE document_replacement_operations SET status='DELIVERY_FAILED',error_code='DELIVERY_RETRY_LIMIT',lease_token=NULL,lease_expires_at=NULL WHERE id=?",
          [id],
          manager,
        );
        return null;
      }
      if (root?.current_operation_id !== op.id || root.status !== 'REPLACED')
        return null;
      await this.store.query(
        "UPDATE document_replacement_operations SET status='DISPATCHING',attempts=attempts+1,lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=?",
        [token, id],
        manager,
      );
      return op;
    });
    if (!operation) return;
    try {
      const business = await this.service.business(
        operation.firebase_id,
        operation.business_number,
      );
      const folders = await this.drive.ensureProtectedFolders(
        business.driveFolderId,
      );
      const parents = await this.drive.getFolderParents(
        operation.candidate_drive_id,
      );
      if (
        !parents?.length ||
        parents.some(
          (parent) =>
            ![
              folders.staging,
              business.driveInboxFolderId,
              business.driveProcessedFolderId,
            ].includes(parent),
        )
      )
        throw new Error('Destination scope mismatch');
      // Idempotent after a crash between the external move and the DB update.
      if (parents.includes(folders.staging))
        await this.drive.moveFile(
          operation.candidate_drive_id,
          folders.staging,
          business.driveInboxFolderId,
        );
      await this.store.transaction(async (manager) => {
        const root = await this.store.root(
          operation.protected_id,
          operation.firebase_id,
          operation.business_number,
          manager,
          true,
        );
        const op = await this.store.operation(id, manager, true);
        if (op?.lease_token !== token || root?.current_operation_id !== id)
          throw new Error('Lease changed');
        await this.store.query(
          "UPDATE document_replacement_operations SET status='QUEUED',processing_status='PENDING',lease_token=NULL,lease_expires_at=NULL,error_code=NULL WHERE id=? AND lease_token=?",
          [id, token],
          manager,
        );
        // The ledger records the intake destination; OCR may already have moved the file to processed.
        await this.store.query(
          'UPDATE imported_documents SET drive_folder_id=? WHERE id=? AND firebase_id=? AND business_number=?',
          [
            business.driveInboxFolderId,
            op.replacement_import_id,
            op.firebase_id,
            op.business_number,
          ],
          manager,
        );
      });
    } catch {
      await this.store.query(
        "UPDATE document_replacement_operations SET status='DELIVERY_FAILED',error_code='DELIVERY_FAILED',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=? AND lease_token=?",
        [id, token],
      );
    }
  }

  /** Recover only our tagged bytes and the still-current reservation. No file
   * name/hash association, no password input, and no DB lock held over Drive.
   */
  async recoverAbandonedUploads(): Promise<void> {
    if (
      !this.service.enabled() ||
      process.env.PROTECTED_PDF_DISPATCH_ENABLED !== 'true'
    )
      return;
    const roots = await this.store.query(
      "SELECT * FROM protected_documents WHERE status='IMPORTING' AND recovery_attempts<5 AND updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) AND (recovery_next_at IS NULL OR recovery_next_at<=UTC_TIMESTAMP(3)) LIMIT 2",
    );
    for (const root of roots) {
      const claimed = await this.store.query(
        "UPDATE protected_documents SET recovery_attempts=recovery_attempts+1,recovery_next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=? AND status='IMPORTING' AND recovery_attempts<5 AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) AND (recovery_next_at IS NULL OR recovery_next_at<=UTC_TIMESTAMP(3))",
        [root.id],
      );
      if (claimed.affectedRows !== 1) continue;
      try {
        const business = await this.service.business(
          root.firebase_id,
          root.business_number,
        );
        const folder = (
          await this.drive.ensureProtectedFolders(business.driveFolderId)
        ).blocked;
        const bytes = await this.recoverBytes(
          folder,
          `root-${root.id}`,
          root.content_hash,
        );
        if (!bytes) continue;
        const metadata =
          typeof root.metadata_json === 'string'
            ? JSON.parse(root.metadata_json)
            : root.metadata_json;
        await this.service.storeLocked({
          firebaseId: root.firebase_id,
          businessNumber: root.business_number,
          filename: root.filename,
          source: root.source as DocumentImportSource,
          content: bytes,
          metadata,
        });
      } catch {
        this.logger.warn('Locked original recovery retained for retry');
      }
    }
    const operations: ReplacementOperation[] = await this.store.query(
      "SELECT * FROM document_replacement_operations WHERE status IN ('RESERVED','UPLOAD_FAILED') AND attempts<5 AND updated_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) AND (next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP(3)) LIMIT 2",
    );
    for (const operation of operations) {
      const root = await this.store.root(
        operation.protected_id,
        operation.firebase_id,
        operation.business_number,
      );
      if (!root || Number(root.version) !== Number(operation.expected_version))
        continue;
      const claimed = await this.store.query(
        "UPDATE document_replacement_operations SET attempts=attempts+1,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE id=? AND status IN ('RESERVED','UPLOAD_FAILED') AND attempts<5 AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3)) AND (next_attempt_at IS NULL OR next_attempt_at<=UTC_TIMESTAMP(3))",
        [operation.id],
      );
      if (claimed.affectedRows !== 1) continue;
      try {
        const business = await this.service.business(
          operation.firebase_id,
          operation.business_number,
        );
        const folder = (
          await this.drive.ensureProtectedFolders(business.driveFolderId)
        ).staging;
        const bytes = await this.recoverBytes(
          folder,
          operation.id,
          operation.content_hash,
          operation.candidate_drive_id,
        );
        if (!bytes) continue;
        await this.service.replace(
          operation.firebase_id,
          operation.actor_id,
          operation.business_number,
          operation.protected_id,
          operation.idempotency_key,
          true,
          {
            buffer: bytes,
            originalname: operation.filename,
            mimetype: 'application/pdf',
          },
          operation.expected_version,
        );
      } catch {
        this.logger.warn('Open-copy upload recovery retained for retry');
      }
    }
  }

  private async recoverBytes(
    folder: string,
    tag: string,
    hash: string,
    candidate?: string,
  ): Promise<Buffer | null> {
    const files = await this.drive.findProtectedUploads(folder, tag);
    // Even a persisted candidate must still carry our private operation tag.
    for (const id of candidate
      ? files.filter((id) => id === candidate)
      : files) {
      const bytes = await this.drive.downloadFile(id);
      if (
        bytes.length <= 10 * 1024 * 1024 &&
        createHash('sha256').update(bytes).digest('hex') === hash
      )
        return bytes;
    }
    return null;
  }
  async reconcile(): Promise<void> {
    if (
      !this.service.enabled() ||
      process.env.PROTECTED_PDF_DISPATCH_ENABLED !== 'true'
    )
      return;
    const queued: ReplacementOperation[] = await this.store.query(
      "SELECT * FROM document_replacement_operations WHERE status='QUEUED' AND processing_status='PENDING' ORDER BY updated_at LIMIT 25",
    );
    for (const op of queued) {
      const rows = await this.store.query(
        'SELECT e.status FROM extracted_document e JOIN imported_documents i ON i.drive_file_id=e.drive_file_id AND i.business_number=e.business_number WHERE i.id=? AND i.business_number=? AND i.firebase_id=?',
        [op.replacement_import_id, op.business_number, op.firebase_id],
      );
      if (!rows.length || rows.some((row) => row.status === 'processing'))
        continue;
      const status = rows.some((row) => row.status === 'error')
        ? 'FAILED'
        : 'SUCCEEDED';
      await this.store.query(
        "UPDATE document_replacement_operations SET processing_status=? WHERE id=? AND processing_status='PENDING'",
        [status, op.id],
      );
    }
  }
}
