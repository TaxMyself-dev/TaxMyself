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
}

export type DocumentImportStatus = 'IMPORTED' | 'ALREADY_IMPORTED' | 'FAILED';

/**
 * The business this document was actually stored under — decided by the same
 * call that performed the upload, never re-derived for display. A batch caller
 * reads it off the real per-file results, so what the user is told matches
 * where the bytes went.
 *
 * Deliberately contains NO storage detail (folder ids, urls, folder names):
 * the user has no access to the underlying Drive, and the destination is a
 * business as far as the product is concerned.
 */
export interface DocumentImportDestination {
  businessNumber: string;
  businessName: string | null;
}

export interface DocumentImportResult {
  status: DocumentImportStatus;
  /** Populated for FAILED; null otherwise. */
  reason: string | null;
  contentHash: string;
  /** For ALREADY_IMPORTED these point at the ORIGINAL import's Drive file. */
  driveFileId: string | null;
  driveFileName: string | null;
  importedDocumentId: number | null;
  /** The business this document was stored under — set on every outcome. */
  destination: DocumentImportDestination;
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
   * upload, DB insert) never throw — they come back as status FAILED so a
   * batch caller can continue with its remaining documents.
   *
   * Every outcome carries the `destination` this call resolved. That is the
   * ONLY sanctioned way to learn where a document went: resolution happens
   * here, once, and the answer travels with the result instead of being
   * recomputed by whoever wants to display it.
   */
  async importDocument(request: DocumentImportRequest): Promise<DocumentImportResult> {
    // Decide the target business first — dedup, Drive folder lookup and the
    // ledger row all key off it. When the caller supplies a number it is
    // honored unchanged; when it is absent the resolver picks the business.
    const business = await this.resolveDestinationBusiness(request);
    const businessNumber = business.businessNumber;
    const destination: DocumentImportDestination = {
      businessNumber,
      businessName: business.businessName ?? null,
    };

    const contentHash = createHash('sha256').update(request.content).digest('hex');

    // Dedup BEFORE any Drive work: the product manages documents, not import
    // history — identical bytes for this user+business are one document, no
    // matter which source (or how many emails) they arrive from.
    const existing = await this.importedDocumentRepo.findOne({
      where: {
        firebaseId: request.firebaseId,
        businessNumber,
        contentHash,
      },
    });
    if (existing) {
      return {
        status: 'ALREADY_IMPORTED',
        reason: null,
        contentHash,
        driveFileId: existing.driveFileId,
        driveFileName: existing.driveFileName,
        importedDocumentId: existing.id,
        destination,
      };
    }

    const inboxFolderId = await this.resolveInboxFolderId(business);

    // Collision-safe name against the CURRENT inbox listing. Listed per
    // import (not cached) so sequential batch imports see each other's
    // uploads and uniquify correctly.
    let driveFileName: string;
    let driveFileId: string;
    try {
      const usedNames = new Set(
        (await this.googleDriveService.listFolderFiles(inboxFolderId)).map((f) => f.name),
      );
      driveFileName = this.pickUniqueName(request.filename, usedNames);
      driveFileId = await this.googleDriveService.uploadFile(
        inboxFolderId,
        driveFileName,
        request.content,
        request.mimeType ?? 'application/octet-stream',
      );
    } catch (error: any) {
      this.logger.error(
        `Drive upload failed for "${request.filename}" ` +
          `(source=${request.source}, business=${businessNumber}): ${error?.message ?? error}`,
      );
      return {
        status: 'FAILED',
        reason: `drive_upload_failed: ${error?.message ?? error}`,
        contentHash,
        driveFileId: null,
        driveFileName: null,
        importedDocumentId: null,
        destination,
      };
    }

    // Record the import. Only after this row exists is the document
    // considered imported — an insert failure cleans up the Drive file
    // (best-effort) so a retry doesn't double-upload.
    const gmail = request.metadata;
    try {
      const saved = await this.importedDocumentRepo.save(
        this.importedDocumentRepo.create({
          firebaseId: request.firebaseId,
          businessNumber,
          source: request.source,
          contentHash,
          driveFileId,
          driveFileName,
          driveFolderId: inboxFolderId,
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
      );
      return {
        status: 'IMPORTED',
        reason: null,
        contentHash,
        driveFileId,
        driveFileName,
        importedDocumentId: saved.id,
        destination,
      };
    } catch (error: any) {
      // Unique-index race: a concurrent import recorded these bytes between
      // our lookup and the insert — the document IS in the system.
      if (this.isDuplicateKeyError(error)) {
        await this.cleanupDriveFile(driveFileId, driveFileName);
        const winner = await this.importedDocumentRepo.findOne({
          where: {
            firebaseId: request.firebaseId,
            businessNumber,
            contentHash,
          },
        });
        return {
          status: 'ALREADY_IMPORTED',
          reason: null,
          contentHash,
          driveFileId: winner?.driveFileId ?? null,
          driveFileName: winner?.driveFileName ?? null,
          importedDocumentId: winner?.id ?? null,
          destination,
        };
      }
      this.logger.error(
        `imported_documents insert failed after Drive upload of "${driveFileName}" ` +
          `(driveFileId=${driveFileId}, source=${request.source}): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      await this.cleanupDriveFile(driveFileId, driveFileName);
      return {
        status: 'FAILED',
        reason: `db_insert_failed: ${error?.message ?? error}`,
        contentHash,
        driveFileId: null,
        driveFileName: null,
        importedDocumentId: null,
        destination,
      };
    }
  }

  /**
   * Decide which business this import targets — the ONE resolution path.
   * Returns the Business row itself (not just its number) so the caller can
   * both upload into it and report it back without a second lookup or a
   * second, drifting copy of these rules.
   *
   * - Explicit businessNumber supplied by the caller → honored as-is, loaded
   *   scoped to the caller's firebaseId (which is what validates ownership).
   * - No businessNumber → delegate to BusinessResolverService, the single home
   *   for "which business does this document belong to" (single business, or
   *   the primary for multi-business users).
   */
  private async resolveDestinationBusiness(
    request: DocumentImportRequest,
  ): Promise<Business & { businessNumber: string }> {
    const explicit = request.businessNumber?.trim();
    const business = explicit
      ? await this.loadBusinessOrThrow(request.firebaseId, explicit)
      : await this.businessResolver.resolveTargetBusiness(request.firebaseId);

    if (!business.businessNumber) {
      throw new BadRequestException(
        `Resolved business (id=${business.id}) has no business number — cannot import into it.`,
      );
    }
    return business as Business & { businessNumber: string };
  }

  private async loadBusinessOrThrow(
    firebaseId: string,
    businessNumber: string,
  ): Promise<Business> {
    const business = await this.businessRepo.findOne({
      where: { firebaseId, businessNumber },
    });
    if (!business) {
      throw new NotFoundException(`Business ${businessNumber} not found for this user`);
    }
    return business;
  }

  /**
   * Resolve the business's Drive inbox/ folder id. If the business folder
   * exists but the inbox/processed pair was never provisioned, backfill it
   * via the existing GoogleDriveService helper (same as the documents flow).
   */
  private async resolveInboxFolderId(business: Business): Promise<string> {
    const businessNumber = business.businessNumber;
    if (business.driveInboxFolderId) {
      return business.driveInboxFolderId;
    }
    if (!business.driveFolderId) {
      throw new BadRequestException(
        `Business ${businessNumber} has no Drive folder yet — open the documents/reports ` +
          'page once so the Drive structure is provisioned, then retry the import.',
      );
    }
    const { inboxFolderId, processedFolderId } =
      await this.googleDriveService.ensureInboxAndProcessed(business.driveFolderId);
    business.driveInboxFolderId = inboxFolderId;
    business.driveProcessedFolderId = processedFolderId;
    await this.businessRepo.save(business);
    return inboxFolderId;
  }

  /** "receipt.pdf" → "receipt (1).pdf", "receipt (2).pdf", ... until free. */
  private pickUniqueName(originalFilename: string, usedNames: Set<string>): string {
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

  /** Best-effort removal of a Drive file whose DB record could not be saved. */
  private async cleanupDriveFile(driveFileId: string, driveFileName: string): Promise<void> {
    try {
      await this.googleDriveService.deleteFile(driveFileId);
      this.logger.warn(
        `Rolled back Drive upload "${driveFileName}" (${driveFileId}) after failed DB insert`,
      );
    } catch (cleanupError: any) {
      this.logger.error(
        `Could not delete orphaned Drive file "${driveFileName}" (${driveFileId}) — ` +
          `it will sit in inbox/ untracked: ${cleanupError?.message ?? cleanupError}`,
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
