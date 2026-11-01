import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { Business } from 'src/business/business.entity';
import { BusinessResolverService } from 'src/business/business-resolver.service';
import { GoogleDriveService } from 'src/google-drive/google-drive.service';
import { ImportedDocument } from './entities/imported-document.entity';
import { DocumentImportSource } from './enums/document-import.enums';
import { DocumentImportBlockedError } from './document-import-blocked.error';
import { traceImportStep } from './document-import-trace';

/** Source-specific traceability carried alongside a Gmail import. */
export interface GmailImportMetadata {
  gmailMessageId: string;
  gmailThreadId?: string | null;
  gmailAttachmentId?: string | null;
  gmailSubject?: string | null;
  gmailFrom?: string | null;
  gmailDate?: string | null;
}

/**
 * Per-source metadata union. Manual/camera uploads pass nothing; future
 * sources (API import, email forwarding) add their own interface here.
 */
export type DocumentImportMetadata = GmailImportMetadata;

export interface DocumentImportRequest {
  firebaseId: string;
  /**
   * Target business. Optional: when omitted (or blank), BusinessResolverService
   * decides the business (single business, or the primary for multi-business
   * users). When explicitly supplied, it is honored and validated as before.
   */
  businessNumber?: string | null;
  source: DocumentImportSource;
  filename: string;
  mimeType: string | null;
  content: Buffer;
  metadata?: DocumentImportMetadata;
  /** Optional opaque intake event ID for safe per-operation timings. Never persisted. */
  traceEventId?: string;
}

export type DocumentImportStatus = 'IMPORTED' | 'ALREADY_IMPORTED' | 'SKIPPED';

export interface DocumentImportResult {
  status: DocumentImportStatus;
  /** Populated for SKIPPED; null otherwise. */
  reason: string | null;
  contentHash: string;
  /** For ALREADY_IMPORTED these point at the ORIGINAL import's Drive file. */
  driveFileId: string | null;
  driveFileName: string | null;
  importedDocumentId: number | null;
}

/**
 * The single shared intake pipeline: every way a document can enter the
 * system (Gmail import, manual upload, camera, future API/email-forwarding)
 * calls importDocument(), which does ALL the generic work — content hash,
 * duplicate detection, upload into the business's Drive inbox/, and the
 * imported_documents ledger row.
 *
 * Drive inbox/ remains the single entry point for the existing Claude
 * analysis flow — this service does not analyze, move to processed/, or
 * create documents/expenses, and contains no source-specific logic.
 */
@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  constructor(
    @InjectRepository(ImportedDocument)
    private readonly importedDocumentRepo: Repository<ImportedDocument>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly googleDriveService: GoogleDriveService,
    private readonly businessResolver: BusinessResolverService,
  ) {}

  /**
   * Import one document into the business's Drive inbox.
   *
   * Throws for environment problems the caller can't work around (business
   * missing, Drive structure unprovisioned). Per-document failures (Drive
   * upload, DB insert) never throw — they come back as status SKIPPED so a
   * batch caller can continue with its remaining documents.
   */
  async importDocument(
    request: DocumentImportRequest,
  ): Promise<DocumentImportResult> {
    // Decide the target business first — dedup, Drive folder lookup and the
    // ledger row all key off businessNumber. When the caller supplies one it is
    // honored unchanged; when it is absent the resolver picks it.
    const businessNumber = await traceImportStep(
      request.traceEventId,
      'business.resolve',
      () => this.resolveBusinessNumber(request),
    );

    const contentHash = await traceImportStep(
      request.traceEventId,
      'content.hash',
      async () => createHash('sha256').update(request.content).digest('hex'),
    );

    // Dedup BEFORE any Drive work: the product manages documents, not import
    // history — identical bytes for this user+business are one document, no
    // matter which source (or how many emails) they arrive from.
    const existing = await traceImportStep(
      request.traceEventId,
      'db.dedup',
      () =>
        this.importedDocumentRepo.findOne({
          where: {
            firebaseId: request.firebaseId,
            businessNumber,
            contentHash,
          },
        }),
    );
    if (existing) {
      return {
        status: 'ALREADY_IMPORTED',
        reason: null,
        contentHash,
        driveFileId: existing.driveFileId,
        driveFileName: existing.driveFileName,
        importedDocumentId: existing.id,
      };
    }

    const { inboxFolderId, processedFolderId } =
      await this.resolveImportFolders(
        request.firebaseId,
        businessNumber,
        request.traceEventId,
      );

    // Collision-safe name against the CURRENT inbox listing. Listed per
    // import (not cached) so sequential batch imports see each other's
    // uploads and uniquify correctly.
    let driveFileName: string;
    let driveFileId: string;
    let driveFolderId = inboxFolderId;
    let uploadedHere = false;
    try {
      const folderIds = [
        ...new Set(
          [inboxFolderId, processedFolderId].filter((id): id is string => !!id),
        ),
      ];
      const listings = await traceImportStep(
        request.traceEventId,
        'drive.list',
        () =>
          Promise.all(
            folderIds.map(async (folderId) => ({
              folderId,
              files: await this.googleDriveService.listFolderFiles(folderId),
            })),
          ),
      );
      // A crash can leave a complete Drive upload without a ledger row. Only
      // inspect this owner's selected business folders. MD5 is a cheap candidate
      // filter; never adopt a file without verifying its actual SHA-256 bytes.
      const md5 = createHash('md5').update(request.content).digest('hex');
      const candidates = listings
        .flatMap(({ folderId, files }) =>
          files
            .filter(
              (file) =>
                file.md5Checksum === md5 &&
                file.size === request.content.length,
            )
            .map((file) => ({ folderId, file })),
        )
        .sort(
          (a, b) =>
            (a.file.createdTime || '').localeCompare(
              b.file.createdTime || '',
            ) || a.file.id.localeCompare(b.file.id),
        );
      let recovered: (typeof candidates)[number] | undefined;
      for (const candidate of candidates) {
        const matches = await traceImportStep(
          request.traceEventId,
          'drive.recovery.verify',
          async () => {
            const bytes = await this.googleDriveService.downloadFile(
              candidate.file.id,
            );
            return (
              createHash('sha256').update(bytes).digest('hex') === contentHash
            );
          },
        );
        if (matches) {
          recovered = candidate;
          break;
        }
      }
      if (recovered) {
        driveFileId = recovered.file.id;
        driveFileName = recovered.file.name;
        driveFolderId = recovered.folderId;
        this.logger.log(
          'Recovered an existing business Drive file by verified content; completing import registration without uploading again',
        );
      } else {
        const usedNames = new Set(
          listings
            .find((list) => list.folderId === inboxFolderId)!
            .files.map((file) => file.name),
        );
        driveFileName = this.pickUniqueName(request.filename, usedNames);
        driveFileId = await traceImportStep(
          request.traceEventId,
          'drive.upload',
          () =>
            this.googleDriveService.uploadFile(
              inboxFolderId,
              driveFileName,
              request.content,
              request.mimeType ?? 'application/octet-stream',
            ),
        );
        uploadedHere = true;
      }
    } catch (error: any) {
      this.logger.error(
        `Drive upload failed for "${request.filename}" ` +
          `(source=${request.source}, business=${businessNumber}): ${
            error?.message ?? error
          }`,
      );
      return {
        status: 'SKIPPED',
        reason: `drive_upload_failed: ${error?.message ?? error}`,
        contentHash,
        driveFileId: null,
        driveFileName: null,
        importedDocumentId: null,
      };
    }

    // Record the import. Only after this row exists is the document
    // considered imported — an insert failure cleans up the Drive file
    // (best-effort) so a retry doesn't double-upload.
    const gmail = request.metadata;
    try {
      const saved = await traceImportStep(
        request.traceEventId,
        'db.import_save',
        () =>
          this.importedDocumentRepo.save(
            this.importedDocumentRepo.create({
              firebaseId: request.firebaseId,
              businessNumber,
              source: request.source,
              contentHash,
              driveFileId,
              driveFileName,
              driveFolderId,
              filename: this.truncate(request.filename, 512) || 'attachment',
              mimeType: request.mimeType,
              size: request.content.length,
              gmailMessageId: this.truncate(gmail?.gmailMessageId ?? null, 64),
              gmailThreadId: this.truncate(gmail?.gmailThreadId ?? null, 64),
              gmailAttachmentId: gmail?.gmailAttachmentId ?? null,
              gmailSubject: this.truncate(gmail?.gmailSubject ?? null, 998),
              gmailFrom: this.truncate(gmail?.gmailFrom ?? null, 512),
              gmailDate: this.truncate(gmail?.gmailDate ?? null, 64),
            }),
          ),
      );
      return {
        status: 'IMPORTED',
        reason: null,
        contentHash,
        driveFileId,
        driveFileName,
        importedDocumentId: saved.id,
      };
    } catch (error: any) {
      // Unique-index race: a concurrent import recorded these bytes between
      // our lookup and the insert — the document IS in the system.
      if (this.isDuplicateKeyError(error)) {
        if (uploadedHere)
          await this.cleanupDriveFile(
            driveFileId,
            driveFileName,
            'duplicate',
            request.traceEventId,
          );
        const winner = await traceImportStep(
          request.traceEventId,
          'db.race_lookup',
          () =>
            this.importedDocumentRepo.findOne({
              where: {
                firebaseId: request.firebaseId,
                businessNumber,
                contentHash,
              },
            }),
        );
        return {
          status: 'ALREADY_IMPORTED',
          reason: null,
          contentHash,
          driveFileId: winner?.driveFileId ?? null,
          driveFileName: winner?.driveFileName ?? null,
          importedDocumentId: winner?.id ?? null,
        };
      }
      this.logger.error(
        `imported_documents insert failed after Drive upload of "${driveFileName}" ` +
          `(driveFileId=${driveFileId}, source=${request.source}): ${
            error?.message ?? error
          }`,
        (error as Error)?.stack,
      );
      // A recovered file may be the only durable copy or a concurrent winner's
      // file. Compensation is permitted only for our own fresh upload.
      if (uploadedHere) {
        await this.cleanupDriveFile(
          driveFileId,
          driveFileName,
          'db-insert-failure',
          request.traceEventId,
        );
      }
      return {
        status: 'SKIPPED',
        reason: `db_insert_failed: ${error?.message ?? error}`,
        contentHash,
        driveFileId: null,
        driveFileName: null,
        importedDocumentId: null,
      };
    }
  }

  /**
   * Decide which business this import targets.
   *
   * - Explicit businessNumber supplied by the caller → honored as-is (the
   *   existing behavior; ownership is validated downstream in
   *   resolveInboxFolderId's business lookup).
   * - No businessNumber → delegate to BusinessResolverService, the single
   *   home for "which business does this document belong to" (single business,
   *   or the primary for multi-business users).
   */
  private async resolveBusinessNumber(
    request: DocumentImportRequest,
  ): Promise<string> {
    const explicit = request.businessNumber?.trim();
    if (explicit) {
      return explicit;
    }

    const business = await this.businessResolver.resolveTargetBusiness(
      request.firebaseId,
    );
    if (!business.businessNumber) {
      throw new BadRequestException(
        `Resolved business (id=${business.id}) has no business number — cannot import into it.`,
      );
    }
    return business.businessNumber;
  }

  /**
   * Resolve the business's Drive inbox/ folder id. If the business folder
   * exists but the inbox/processed pair was never provisioned, backfill it
   * via the existing GoogleDriveService helper (same as the documents flow).
   */
  private async resolveImportFolders(
    firebaseId: string,
    businessNumber: string,
    traceEventId?: string,
  ): Promise<{ inboxFolderId: string; processedFolderId: string | null }> {
    const business = await traceImportStep(
      traceEventId,
      'db.folder_lookup',
      () =>
        this.businessRepo.findOne({
          where: { firebaseId, businessNumber },
        }),
    );
    if (!business) {
      throw new NotFoundException(
        `Business ${businessNumber} not found for this user`,
      );
    }
    if (business.driveInboxFolderId) {
      return {
        inboxFolderId: business.driveInboxFolderId,
        processedFolderId: business.driveProcessedFolderId,
      };
    }
    if (!business.driveFolderId) {
      throw new DocumentImportBlockedError(
        'DRIVE_FOLDER_MISSING',
        `Business ${businessNumber} has no Drive folder yet — open the documents/reports ` +
          'page once so the Drive structure is provisioned, then retry the import.',
      );
    }
    const { inboxFolderId, processedFolderId } = await traceImportStep(
      traceEventId,
      'drive.provision',
      () =>
        this.googleDriveService.ensureInboxAndProcessed(business.driveFolderId),
    );
    business.driveInboxFolderId = inboxFolderId;
    business.driveProcessedFolderId = processedFolderId;
    await traceImportStep(traceEventId, 'db.folder_save', () =>
      this.businessRepo.save(business),
    );
    return { inboxFolderId, processedFolderId };
  }

  /** "receipt.pdf" → "receipt (1).pdf", "receipt (2).pdf", ... until free. */
  private pickUniqueName(
    originalFilename: string,
    usedNames: Set<string>,
  ): string {
    // Drive accepts most characters; slashes confuse the UI breadcrumbs
    // (same rule as GoogleDriveService.sanitizeFolderName).
    const cleaned =
      (originalFilename ?? '').replace(/[\\/]/g, '-').trim() || 'attachment';
    if (!usedNames.has(cleaned)) return cleaned;

    const dot = cleaned.lastIndexOf('.');
    const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
    const ext = dot > 0 ? cleaned.slice(dot) : '';
    for (let i = 1; ; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!usedNames.has(candidate)) return candidate;
    }
  }

  /** Best-effort removal of a redundant or untracked Drive upload. */
  private async cleanupDriveFile(
    driveFileId: string,
    driveFileName: string,
    reason: 'duplicate' | 'db-insert-failure',
    traceEventId?: string,
  ): Promise<void> {
    try {
      await traceImportStep(traceEventId, 'drive.cleanup', () =>
        this.googleDriveService.deleteFile(driveFileId),
      );
      if (reason === 'duplicate') {
        this.logger.debug(
          `Removed redundant Drive upload "${driveFileName}" (${driveFileId}) ` +
            'after a concurrent import won the deduplication race',
        );
      } else {
        this.logger.warn(
          `Rolled back Drive upload "${driveFileName}" (${driveFileId}) after failed DB insert`,
        );
      }
    } catch (cleanupError: any) {
      const uploadKind =
        reason === 'duplicate' ? 'duplicate Drive file' : 'orphaned Drive file';
      this.logger.error(
        `Could not delete ${uploadKind} "${driveFileName}" (${driveFileId}) — ` +
          `it will sit in inbox/ untracked: ${
            cleanupError?.message ?? cleanupError
          }`,
      );
    }
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error?.code === 'ER_DUP_ENTRY' ||
      /duplicate entry|unique constraint/i.test(error?.message ?? '')
    );
  }

  private truncate(value: string | null, max: number): string | null {
    if (value == null) return null;
    return value.length > max ? value.slice(0, max) : value;
  }
}
