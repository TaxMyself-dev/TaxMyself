import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Business } from '../business/business.entity';
import { ImportedDocument } from '../document-import/entities/imported-document.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { ProtectedPdfService } from '../protected-pdf/protected-pdf.service';
import { PdfInspectionService } from '../protected-pdf/pdf-inspection.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { EmailIntakeStore, EmailRun, EmailItem } from './email-intake.store';
@Injectable()
export class EmailIntakeStorage {
  constructor(
    readonly store: EmailIntakeStore,
    @InjectRepository(Business) readonly businesses: Repository<Business>,
    @InjectRepository(ImportedDocument)
    readonly imports: Repository<ImportedDocument>,
    readonly drive: GoogleDriveService,
    readonly protectedPdf: ProtectedPdfService,
    readonly pdf: PdfInspectionService,
  ) {}
  async accept(run: EmailRun, item: EmailItem, bytes: Buffer) {
    if (!this.store.enabled()) throw new Error('Durable intake disabled');
    const business = await this.businesses.findOneBy({
      firebaseId: run.firebase_id,
      businessNumber: run.business_number,
    });
    if (
      !business?.driveFolderId ||
      !business.driveInboxFolderId ||
      business.firebaseId !== run.firebase_id ||
      business.businessNumber !== run.business_number
    )
      throw new Error('Business folders unavailable');
    if (
      !['application/pdf', 'image/jpeg', 'image/png'].includes(
        item.mime_type,
      ) ||
      !bytes.length ||
      bytes.length > 10 * 1024 * 1024
    )
      throw new Error('Attachment requires manual handling');
    const metadata =
      typeof item.source_metadata_json === 'string'
        ? JSON.parse(item.source_metadata_json)
        : item.source_metadata_json || {};
    const hash = createHash('sha256').update(bytes).digest('hex');
    const existing = await this.imports.findOneBy({
      firebaseId: run.firebase_id,
      businessNumber: run.business_number,
      contentHash: hash,
    });
    if (existing) {
      const work = await this.store.work(
        existing.id,
        run.firebase_id,
        run.business_number,
      );
      if (work.email_work_state !== 'STAGING')
        return { id: work.id, duplicate: true };
    }
    const inspection =
      item.mime_type === 'application/pdf'
        ? await this.pdf.inspect(bytes)
        : { kind: 'readable' };
    if (inspection.kind === 'password_required') {
      if (!this.protectedPdf.enabled())
        throw new Error('Password handling unavailable');
      const result = await this.protectedPdf.storeLocked({
        firebaseId: run.firebase_id,
        businessNumber: run.business_number,
        filename: item.filename,
        source: DocumentImportSource.GMAIL,
        content: bytes,
        metadata: {
          ...metadata,
          integrationId: run.integration_id,
          emailRunId: run.id,
          gmailMessageId: item.message_id,
        },
      });
      await this.store.query(
        "UPDATE imported_documents SET email_work_state='PASSWORD_REQUIRED',email_run_id=? WHERE id=? AND firebase_id=? AND business_number=? AND email_work_state='LEGACY'",
        [
          run.id,
          result.importedDocumentId,
          run.firebase_id,
          run.business_number,
        ],
      );
      return {
        id: result.importedDocumentId,
        duplicate: result.status === 'ALREADY_IMPORTED',
      };
    }
    const tag = randomUUID();
    const fields = {
      firebase_id: run.firebase_id,
      business_number: run.business_number,
      source: 'GMAIL',
      content_hash: hash,
      drive_file_id: null,
      drive_file_name: null,
      drive_folder_id: null,
      filename: item.filename,
      mime_type: item.mime_type,
      size: bytes.length,
      gmail_message_id: item.message_id?.slice(0, 64) || null,
      gmail_thread_id: metadata.gmailThreadId?.slice(0, 64) || null,
      gmail_subject: metadata.gmailSubject?.slice(0, 998) || null,
      gmail_from: metadata.gmailFrom?.slice(0, 512) || null,
      gmail_date: metadata.gmailDate?.slice(0, 64) || null,
      email_work_state: 'STAGING',
      email_run_id: run.id,
      email_upload_tag: tag,
    };
    await this.store.query(
      'INSERT IGNORE INTO imported_documents (' +
        Object.keys(fields).join(',') +
        ') VALUES (' +
        Object.keys(fields)
          .map(() => '?')
          .join(',') +
        ')',
      Object.values(fields),
    );
    const rows = await this.store.query(
      'SELECT * FROM imported_documents WHERE firebase_id=? AND business_number=? AND content_hash=?',
      [run.firebase_id, run.business_number, hash],
    );
    const work = rows[0];
    if (work.email_work_state !== 'STAGING')
      return { id: work.id, duplicate: true };
    const token = await this.store.claimWork(work);
    if (!token) throw new Error('Content intake busy');
    try {
      const folder = await this.drive.ensureIntakeStaging(
        business.driveFolderId,
      );
      const candidates = await this.drive.findProtectedUploads(
        folder,
        work.email_upload_tag,
      );
      let id: string;
      for (const candidate of candidates) {
        if (
          createHash('sha256')
            .update(await this.drive.downloadFile(candidate))
            .digest('hex') === hash
        ) {
          id = candidate;
          break;
        }
      }
      if (!id && candidates.length)
        throw new Error('Recovery identity mismatch');
      if (!id)
        id = await this.drive.uploadProtectedFile(
          folder,
          item.filename,
          bytes,
          work.email_upload_tag,
          item.mime_type,
        );
      await this.store.updateWork(work, token, {
        drive_file_id: id,
        drive_file_name: item.filename,
        drive_folder_id: folder,
        email_work_state:
          inspection.kind === 'readable'
            ? 'MOVE_PENDING'
            : inspection.kind === 'limit'
              ? 'BLOCKED_LIMIT'
              : 'BLOCKED_INVALID',
        email_lease_token: null,
        email_lease_expires_at: null,
      });
      return { id: work.id, duplicate: false };
    } catch (error) {
      await this.store.query(
        "UPDATE imported_documents SET email_lease_token=NULL,email_lease_expires_at=NULL,email_error_code='STORAGE_RETRY' WHERE id=? AND email_lease_token=?",
        [work.id, token],
      );
      if (error && typeof error === 'object') error.intakeWorkId = work.id;
      throw error;
    }
  }
}
