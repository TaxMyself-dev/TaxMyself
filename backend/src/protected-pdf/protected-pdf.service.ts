import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Business } from '../business/business.entity';
import { ImportedDocument } from '../document-import/entities/imported-document.entity';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { PdfInspectionService } from './pdf-inspection.service';
import { ArchiveItemStatus, RecordSource } from '../enum';
import { replacementProcessingOutcome } from '../documents/document-outcome.util';
import {
  ProtectedPdfStore,
  ProtectedRoot,
  ReplacementOperation,
} from './protected-pdf.store';

export interface LockedIntake {
  firebaseId: string;
  businessNumber: string;
  filename: string;
  content: Buffer;
  source: DocumentImportSource;
  metadata?: Record<string, any>;
}
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const safeName = (value: string) =>
  (value || 'document.pdf').replace(/[\\/\x00-\x1f]/g, '-').slice(0, 500);

@Injectable()
export class ProtectedPdfService {
  constructor(
    readonly store: ProtectedPdfStore,
    readonly inspection: PdfInspectionService,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    @InjectRepository(ImportedDocument)
    private readonly imports: Repository<ImportedDocument>,
    @InjectRepository(ExtractedDocument)
    private readonly extracted: Repository<ExtractedDocument>,
    private readonly drive: GoogleDriveService,
  ) {}

  enabled(): boolean {
    return process.env.PROTECTED_PDF_ENABLED === 'true';
  }
  assertEnabled(): void {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        'Protected PDF handling is disabled',
      );
  }
  async business(owner: string, number: string): Promise<Business> {
    if (!owner || !number)
      throw new BadRequestException('Business is required');
    const row = await this.businesses.findOne({
      where: { firebaseId: owner, businessNumber: number },
    });
    if (!row || row.firebaseId !== owner || row.businessNumber !== number)
      throw new NotFoundException('Document not found');
    if (!row.driveFolderId || !row.driveInboxFolderId)
      throw new ConflictException('Business Drive folders are not provisioned');
    return row;
  }
  private async taggedUpload(
    folder: string,
    operation: string,
    name: string,
    content: Buffer,
  ): Promise<string> {
    const candidates = await this.drive.findProtectedUploads(folder, operation);
    // A late network upload may leave two tagged copies. Do not delete either here.
    // Recover only verified bytes belonging to THIS operation and selected folder.
    for (const candidate of candidates) {
      if (digest(await this.drive.downloadFile(candidate)) === digest(content))
        return candidate;
    }
    if (candidates.length)
      throw new ConflictException('Upload recovery content mismatch');
    return this.drive.uploadProtectedFile(folder, name, content, operation);
  }
  private ledger(
    input: LockedIntake,
    driveId: string,
    folderId: string,
  ): Partial<ImportedDocument> {
    const m = input.metadata || {};
    return {
      firebaseId: input.firebaseId,
      businessNumber: input.businessNumber,
      source: input.source,
      contentHash: digest(input.content),
      filename: safeName(input.filename),
      driveFileName: safeName(input.filename),
      driveFileId: driveId,
      driveFolderId: folderId,
      mimeType: 'application/pdf',
      size: input.content.length,
      gmailMessageId: m.gmailMessageId?.slice(0, 64) || null,
      gmailThreadId: m.gmailThreadId?.slice(0, 64) || null,
      gmailAttachmentId: m.gmailAttachmentId || null,
      gmailSubject: m.gmailSubject?.slice(0, 998) || null,
      gmailFrom: m.gmailFrom?.slice(0, 512) || null,
      gmailDate: m.gmailDate?.slice(0, 64) || null,
    };
  }

  async storeLocked(input: LockedIntake): Promise<{
    status: 'IMPORTED' | 'ALREADY_IMPORTED';
    importedDocumentId: number;
    driveFileId: string;
    driveFileName: string;
    contentHash: string;
    reason: null;
    passwordRequired: boolean;
  }> {
    this.assertEnabled();
    if (
      (await this.inspection.inspect(input.content)).kind !==
      'password_required'
    )
      throw new BadRequestException(
        'File does not require an opening password',
      );
    const business = await this.business(
      input.firebaseId,
      input.businessNumber,
    );
    const hash = digest(input.content),
      filename = safeName(input.filename);
    await this.store.query(
      'INSERT INTO protected_documents (firebase_id,business_number,content_hash,filename,source,metadata_json,integration_id,status) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
      [
        input.firebaseId,
        input.businessNumber,
        hash,
        filename,
        input.source,
        JSON.stringify(input.metadata || {}),
        input.metadata?.integrationId || null,
        'IMPORTING',
      ],
    );
    const root: ProtectedRoot = (
      await this.store.query(
        'SELECT * FROM protected_documents WHERE firebase_id=? AND business_number=? AND content_hash=?',
        [input.firebaseId, input.businessNumber, hash],
      )
    )[0];
    if (
      !root ||
      root.firebase_id !== input.firebaseId ||
      root.business_number !== input.businessNumber
    )
      throw new NotFoundException('Document not found');
    if (root.original_import_id && root.status !== 'IMPORTING') {
      const record = await this.imports.findOne({
        where: {
          id: root.original_import_id,
          firebaseId: input.firebaseId,
          businessNumber: input.businessNumber,
        },
      });
      if (!record)
        throw new ConflictException('Original import record missing');
      return {
        status: 'ALREADY_IMPORTED',
        importedDocumentId: record.id,
        driveFileId: record.driveFileId,
        driveFileName: record.driveFileName,
        contentHash: hash,
        reason: null,
        passwordRequired: root.status === 'PASSWORD_REQUIRED',
      };
    }
    const token = randomUUID();
    const claim = await this.store.query(
      "UPDATE protected_documents SET lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=? AND status='IMPORTING' AND (lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))",
      [token, root.id],
    );
    if (claim.affectedRows !== 1)
      throw new ConflictException('This document is already being stored');
    try {
      const folders = await this.drive.ensureProtectedFolders(
        business.driveFolderId,
      );
      let original = await this.imports.findOne({
        where: {
          firebaseId: input.firebaseId,
          businessNumber: input.businessNumber,
          contentHash: hash,
        },
      });
      let driveId: string;
      if (original) {
        if (
          original.firebaseId !== input.firebaseId ||
          original.businessNumber !== input.businessNumber
        )
          throw new NotFoundException('Document not found');
        const accounted = await this.extracted.find({
          where: {
            driveFileId: original.driveFileId,
            businessNumber: input.businessNumber,
          },
        });
        if (
          accounted.some(
            (row) =>
              row.confirmedExpenseId != null || row.status === 'approved',
          )
        )
          throw new ConflictException(
            'An accounted document cannot be converted to a locked document',
          );
        driveId = original.driveFileId;
        const parents = await this.drive.getFolderParents(driveId);
        if (
          !parents?.length ||
          parents.some(
            (parent) =>
              ![
                business.driveInboxFolderId,
                business.driveProcessedFolderId,
                folders.blocked,
              ].includes(parent),
          )
        )
          throw new ConflictException('Original file is outside its business');
        if (!parents.includes(folders.blocked))
          await this.drive.moveFile(driveId, parents[0], folders.blocked);
      } else
        driveId = await this.taggedUpload(
          folders.blocked,
          `root-${root.id}`,
          filename,
          input.content,
        );
      const saved = await this.store.transaction(async (manager) => {
        const current = await this.store.root(
          root.id,
          input.firebaseId,
          input.businessNumber,
          manager,
          true,
        );
        if (current?.lease_token !== token || current.status !== 'IMPORTING')
          throw new ConflictException('Document storage reservation changed');
        const repo = manager.getRepository(ImportedDocument);
        original = await repo.findOne({
          where: {
            firebaseId: input.firebaseId,
            businessNumber: input.businessNumber,
            contentHash: hash,
          },
        });
        if (original && original.driveFileId !== driveId) {
          // Another intake won the content key during our external upload.
          // Reconcile its actual file outside a transaction on the next retry.
          throw new ConflictException(
            'Concurrent intake registered another copy; retry to reconcile',
          );
        }
        const record =
          original ||
          (await repo.save(
            repo.create(this.ledger(input, driveId, folders.blocked)),
          ));
        await this.store.query(
          "UPDATE protected_documents SET original_import_id=?,original_drive_id=?,source=?,status='PASSWORD_REQUIRED',lease_token=NULL,lease_expires_at=NULL,error_code=NULL WHERE id=? AND lease_token=?",
          [record.id, driveId, record.source, root.id, token],
          manager,
        );
        return record;
      });
      return {
        status: original ? 'ALREADY_IMPORTED' : 'IMPORTED',
        importedDocumentId: saved.id,
        driveFileId: saved.driveFileId,
        driveFileName: saved.driveFileName,
        contentHash: hash,
        reason: null,
        passwordRequired: true,
      };
    } catch (error) {
      await this.store
        .query(
          "UPDATE protected_documents SET lease_token=NULL,lease_expires_at=NULL,error_code='STORAGE_FAILED' WHERE id=? AND lease_token=?",
          [root.id, token],
        )
        .catch(() => undefined);
      throw error instanceof ConflictException
        ? error
        : new ServiceUnavailableException(
            'Locked document could not be stored; retry without resetting history',
          );
    }
  }

  async replace(
    owner: string,
    actor: string,
    businessNumber: string,
    protectedId: number,
    idempotencyKey: string,
    confirmed: boolean,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    recoveryVersion?: number,
  ): Promise<any> {
    this.assertEnabled();
    if (
      !confirmed ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey || '') ||
      !Number.isSafeInteger(protectedId) ||
      protectedId < 1
    )
      throw new BadRequestException(
        'Explicit confirmation, document ID and idempotency key required',
      );
    // Authorize before inspecting attacker-provided bytes or revealing document state.
    const business = await this.business(owner, businessNumber);
    const authorized = await this.store.root(
      protectedId,
      owner,
      businessNumber,
    );
    if (!authorized) throw new NotFoundException('Document not found');
    if (
      !file?.buffer ||
      file.mimetype !== 'application/pdf' ||
      !/\.pdf$/i.test(file.originalname || '')
    )
      throw new BadRequestException('A PDF copy is required');
    const inspection = await this.inspection.inspect(file.buffer);
    if (inspection.kind !== 'readable')
      throw new BadRequestException({
        code:
          inspection.kind === 'password_required'
            ? 'PASSWORD_REQUIRED'
            : inspection.kind === 'limit'
            ? 'PDF_VALIDATION_LIMIT'
            : 'INVALID_PDF',
        message: 'יש להעלות PDF תקין שניתן לפתוח ללא סיסמה',
      });
    const hash = digest(file.buffer),
      filename = safeName(file.originalname);
    const reservation = await this.store.transaction(async (manager) => {
      const root = await this.store.root(
        protectedId,
        owner,
        businessNumber,
        manager,
        true,
      );
      if (!root || !root.original_import_id)
        throw new NotFoundException('Document not found');
      if (
        recoveryVersion !== undefined &&
        Number(root.version) !== Number(recoveryVersion)
      )
        throw new ConflictException(
          'A newer replacement superseded this recovery',
        );
      let operation: ReplacementOperation = (
        await this.store.query(
          'SELECT * FROM document_replacement_operations WHERE protected_id=? AND idempotency_key=? FOR UPDATE',
          [protectedId, idempotencyKey],
          manager,
        )
      )[0];
      if (
        operation &&
        (operation.content_hash !== hash || operation.filename !== filename)
      )
        throw new ConflictException(
          'Idempotency key belongs to another upload',
        );
      if (
        operation &&
        !['RESERVED', 'UPLOAD_FAILED'].includes(operation.status)
      )
        return { operation, complete: true };
      if (
        root.lease_token &&
        new Date(root.lease_expires_at).getTime() > Date.now()
      )
        throw new ConflictException('Another replacement is in progress');
      if (root.status === 'REPLACED') {
        const previous = await this.store.operation(
          root.current_operation_id,
          manager,
          true,
        );
        if (
          !['FAILED', 'NO_INVOICE_FOUND'].includes(previous?.processing_status)
        )
          throw new ConflictException(
            'Replacement already accepted or still processing',
          );
      } else if (root.status !== 'PASSWORD_REQUIRED')
        throw new ConflictException('Document is not ready for replacement');
      const id = operation?.id || randomUUID(),
        version = Number(root.version) + 1,
        uploadToken = randomUUID();
      if (!operation) {
        await this.store.query(
          "INSERT INTO document_replacement_operations (id,protected_id,firebase_id,business_number,actor_id,idempotency_key,content_hash,filename,size,status,expected_version) VALUES (?,?,?,?,?,?,?,?,?,'RESERVED',?)",
          [
            id,
            protectedId,
            owner,
            businessNumber,
            actor,
            idempotencyKey,
            hash,
            filename,
            file.buffer.length,
            version,
          ],
          manager,
        );
      } else
        await this.store.query(
          "UPDATE document_replacement_operations SET status='RESERVED',expected_version=?,error_code=NULL WHERE id=?",
          [version, id],
          manager,
        );
      await this.store.query(
        'UPDATE protected_documents SET version=?,lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=?',
        [version, uploadToken, protectedId],
        manager,
      );
      await this.store.query(
        'UPDATE document_replacement_operations SET lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=?',
        [uploadToken, id],
        manager,
      );
      return {
        operation: await this.store.operation(id, manager),
        complete: false,
        uploadToken,
      };
    });
    if (reservation.complete) return this.result(reservation.operation);
    const operation = reservation.operation;
    try {
      const folders = await this.drive.ensureProtectedFolders(
        business.driveFolderId,
      );
      const candidateId =
        operation.candidate_drive_id ||
        (await this.taggedUpload(
          folders.staging,
          operation.id,
          filename,
          file.buffer,
        ));
      // Persist upload identity before the linkage commit, enabling recovery after a crash.
      const uploaded = await this.store.query(
        "UPDATE document_replacement_operations SET candidate_drive_id=? WHERE id=? AND status='RESERVED' AND lease_token=? AND expected_version=?",
        [
          candidateId,
          operation.id,
          reservation.uploadToken,
          operation.expected_version,
        ],
      );
      if (uploaded.affectedRows !== 1)
        throw new ConflictException('Upload reservation expired or changed');
      const accepted = await this.store.transaction(async (manager) => {
        const root = await this.store.root(
          protectedId,
          owner,
          businessNumber,
          manager,
          true,
        );
        if (
          root?.lease_token !== reservation.uploadToken ||
          Number(root.version) !== Number(operation.expected_version)
        )
          throw new ConflictException('Replacement reservation changed');
        const repo = manager.getRepository(ImportedDocument);
        const original = await repo.findOne({
          where: {
            id: root.original_import_id,
            firebaseId: owner,
            businessNumber,
          },
        });
        if (
          !original ||
          original.firebaseId !== owner ||
          original.businessNumber !== businessNumber
        )
          throw new ConflictException('Original import record missing');
        if (
          await repo.findOne({
            where: { firebaseId: owner, businessNumber, contentHash: hash },
          })
        )
          throw new ConflictException(
            'Copy is already linked to another document; no automatic association was made',
          );
        const {
          id: _id,
          createdAt: _created,
          updatedAt: _updated,
          ...provenance
        } = original;
        const replacement = await repo.save(
          repo.create({
            ...provenance,
            contentHash: hash,
            filename,
            driveFileName: filename,
            driveFileId: candidateId,
            driveFolderId: folders.staging,
            size: file.buffer.length,
            mimeType: 'application/pdf',
          }),
        );
        await this.store.query(
          "UPDATE document_replacement_operations SET replacement_import_id=?,status='PENDING',processing_status='NOT_STARTED',attempts=0,next_attempt_at=UTC_TIMESTAMP(3),error_code=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=?",
          [replacement.id, operation.id],
          manager,
        );
        await this.store.query(
          "UPDATE protected_documents SET status='REPLACED',current_operation_id=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND version=?",
          [operation.id, protectedId, operation.expected_version],
          manager,
        );
        return this.store.operation(operation.id, manager);
      });
      return this.result(accepted);
    } catch (error) {
      // Retain both original and tagged staging candidate. Retrying the SAME key recovers it.
      await this.store
        .transaction(async (manager) => {
          await this.store.query(
            "UPDATE document_replacement_operations SET status='UPLOAD_FAILED',error_code='UPLOAD_OR_LINK_FAILED',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='RESERVED' AND lease_token=?",
            [operation.id, reservation.uploadToken],
            manager,
          );
          await this.store.query(
            'UPDATE protected_documents SET lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?',
            [protectedId, reservation.uploadToken],
            manager,
          );
        })
        .catch(() => undefined);
      throw error instanceof ConflictException
        ? error
        : new ServiceUnavailableException(
            'העלאת החלופה לא הושלמה; המקור נשמר. ניתן לנסות שוב',
          );
    }
  }

  result(operation: ReplacementOperation): any {
    return {
      operationId: operation.id,
      protectedDocumentId: operation.protected_id,
      uploadStatus: operation.status,
      processingStatus: operation.processing_status,
      accepted: !['RESERVED', 'UPLOAD_FAILED'].includes(operation.status),
    };
  }
  async retryDelivery(
    owner: string,
    businessNumber: string,
    id: number,
  ): Promise<void> {
    this.assertEnabled();
    await this.business(owner, businessNumber);
    await this.store.transaction(async (manager) => {
      const root = await this.store.root(
        id,
        owner,
        businessNumber,
        manager,
        true,
      );
      if (!root?.current_operation_id)
        throw new NotFoundException('Replacement not found');
      const op = await this.store.operation(
        root.current_operation_id,
        manager,
        true,
      );
      if (op?.status !== 'DELIVERY_FAILED')
        throw new ConflictException('Delivery is not waiting for retry');
      await this.store.query(
        "UPDATE document_replacement_operations SET status='PENDING',attempts=0,next_attempt_at=UTC_TIMESTAMP(3),error_code=NULL WHERE id=?",
        [op.id],
        manager,
      );
    });
  }
  async history(
    owner: string,
    businessNumber: string,
    id: number,
  ): Promise<any> {
    this.assertEnabled();
    await this.business(owner, businessNumber);
    const root = await this.store.root(id, owner, businessNumber);
    if (!root) throw new NotFoundException('Document not found');
    const operations = await this.store.query(
      'SELECT id,status,processing_status,candidate_drive_id,filename,error_code,created_at,updated_at FROM document_replacement_operations WHERE protected_id=? AND firebase_id=? AND business_number=? ORDER BY created_at',
      [id, owner, businessNumber],
    );
    return {
      protectedDocumentId: root.id,
      source: root.source,
      originalImportId: root.original_import_id,
      originalDriveFileId: root.original_drive_id,
      originalFilename: root.filename,
      status: root.status,
      operations: await Promise.all(
        operations.map(async (operation) => ({
          ...operation,
          processing_status: await this.processingStatusForDisplay(
            operation.processing_status,
            operation.candidate_drive_id,
            businessNumber,
          ),
        })),
      ),
    };
  }
  private async processingStatusForDisplay(
    status: string,
    fileId: string | null,
    businessNumber: string,
  ): Promise<string> {
    if (status !== 'FAILED' || !fileId) return status;
    const rows = await this.extracted.find({
      where: { driveFileId: fileId, businessNumber },
      select: ['status', 'rawResponse', 'rejectionReason'],
    });
    return replacementProcessingOutcome(rows) === 'NO_INVOICE_FOUND'
      ? 'NO_INVOICE_FOUND'
      : status;
  }
  async passwordCounts(
    owner: string,
    ids: number[],
  ): Promise<Map<number, number>> {
    if (!this.enabled() || !ids.length) return new Map();
    const rows = await this.store.query(
      "SELECT integration_id,COUNT(*) AS count FROM protected_documents WHERE firebase_id=? AND status='PASSWORD_REQUIRED' AND integration_id IN (" +
        ids.map(() => '?').join(',') +
        ') GROUP BY integration_id',
      [owner, ...ids],
    );
    return new Map(
      rows.map((row) => [Number(row.integration_id), Number(row.count)]),
    );
  }
  async recordRun(
    owner: string,
    integrationId: number,
    summary: any,
  ): Promise<void> {
    if (!this.enabled()) return;
    await this.store.query(
      'INSERT INTO protected_pdf_import_runs (id,integration_id,firebase_id,summary_json) VALUES (?,?,?,?)',
      [randomUUID(), integrationId, owner, JSON.stringify(summary)],
    );
  }
  async decorateArchive(
    owner: string,
    businessNumber: string,
    items: any[],
    canManage: boolean,
  ): Promise<any[]> {
    if (!this.enabled()) return items;
    const roots = await this.store.query(
      "SELECT p.*,o.candidate_drive_id,o.status AS replacement_status,o.processing_status FROM protected_documents p LEFT JOIN document_replacement_operations o ON o.id=p.current_operation_id WHERE p.firebase_id=? AND p.business_number=? AND p.status IN ('PASSWORD_REQUIRED','REPLACED')",
      [owner, businessNumber],
    );
    const oldFiles = await this.store.query(
      "SELECT o.candidate_drive_id FROM document_replacement_operations o JOIN protected_documents p ON p.id=o.protected_id WHERE p.firebase_id=? AND p.business_number=? AND o.id<>COALESCE(p.current_operation_id,'')",
      [owner, businessNumber],
    );
    const hidden = new Set(
      [
        ...roots.map((row) => row.original_drive_id),
        ...oldFiles.map((row) => row.candidate_drive_id),
      ].filter(Boolean),
    );
    const result = items.filter((item) => !hidden.has(item.driveFileId));
    for (const root of roots) {
      root.processing_status = await this.processingStatusForDisplay(
        root.processing_status,
        root.candidate_drive_id,
        businessNumber,
      );
      // SQL NULL means there is no replacement file. Unrelated manual/bank
      // rows also have a null Drive ID and must never represent this document.
      const represented = root.candidate_drive_id
        ? result.filter((item) => item.driveFileId === root.candidate_drive_id)
        : [];
      const extras = {
        protectedDocumentId: root.id,
        originalDriveFileId: root.original_drive_id,
        canUploadOpenCopy:
          canManage &&
          (root.status === 'PASSWORD_REQUIRED' ||
            ['FAILED', 'NO_INVOICE_FOUND'].includes(root.processing_status)),
        replacementUploadStatus: root.replacement_status,
        replacementProcessingStatus: root.processing_status,
        canRetryDelivery:
          canManage && root.replacement_status === 'DELIVERY_FAILED',
      };
      if (represented.length) {
        represented.forEach((item) => Object.assign(item, extras));
        continue;
      }
      result.push({
        ...extras,
        id: -(2 ** 40 + root.id),
        itemType: 'DOCUMENT',
        documentType: null,
        documentKind: null,
        name: root.filename,
        documentDate: null,
        uploadDate: root.created_at,
        source: ['GMAIL', 'EMAIL_FORWARDING'].includes(root.source)
          ? RecordSource.EMAIL
          : RecordSource.DRIVE,
        status:
          root.status === 'PASSWORD_REQUIRED'
            ? ArchiveItemStatus.PASSWORD_REQUIRED
            : root.replacement_status === 'DELIVERY_FAILED'
            ? ArchiveItemStatus.ERROR
            : ArchiveItemStatus.PENDING,
        canResolve: false,
        canReclassify: false,
        canManageExpenses: canManage,
        driveFileId:
          root.status === 'PASSWORD_REQUIRED'
            ? root.original_drive_id
            : root.candidate_drive_id,
        expenseFile: null,
        rejectionReason: null,
        vatReportPeriod: null,
        annualReportingYear: null,
      });
    }
    return result;
  }
}
