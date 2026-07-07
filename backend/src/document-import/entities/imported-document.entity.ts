import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentImportSource } from '../enums/document-import.enums';

/**
 * Ledger of documents imported into a business's Drive inbox through the
 * shared import pipeline (DocumentImportService) — from ANY source: Gmail,
 * manual upload, camera, API, email forwarding. One row per document that
 * actually landed in Drive; this table is the dedup source of truth.
 *
 * User identity via firebase_id (varchar) — no FK to the user table,
 * following the billing/integrations convention.
 *
 * Dedup key: (firebaseId, businessNumber, contentHash). The product manages
 * documents, not import history — the same bytes imported twice (two emails,
 * or Gmail then camera) must land in the system exactly once per business.
 * Source and the gmail_* columns are traceability only and deliberately NOT
 * part of the key. Scoped per business because each business has its own
 * Drive inbox and analysis run.
 *
 * gmail_attachment_id note: stored as TEXT and informational only — verified
 * (docs + live experiment, 2026-07-07) that Gmail regenerates it on every
 * API fetch and it runs ~400 chars, so it can never identify anything.
 */
@Entity('imported_documents')
@Index('ux_imported_documents_content', ['firebaseId', 'businessNumber', 'contentHash'], { unique: true })
@Index('ix_imported_documents_user_business', ['firebaseId', 'businessNumber'])
export class ImportedDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({ name: 'business_number', type: 'varchar', length: 255 })
  businessNumber: string;

  @Column({
    type: 'enum',
    enum: DocumentImportSource,
    enumName: 'DocumentImportSource',
  })
  source: DocumentImportSource;

  /** SHA-256 of the document bytes, hex-encoded — the dedup identity. */
  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash: string;

  @Column({ name: 'drive_file_id', type: 'varchar', length: 255 })
  driveFileId: string;

  /** Final name in Drive — may differ from filename when uniquified. */
  @Column({ name: 'drive_file_name', type: 'varchar', length: 512 })
  driveFileName: string;

  /** The Drive inbox/ folder the file was uploaded into. */
  @Column({ name: 'drive_folder_id', type: 'varchar', length: 255 })
  driveFolderId: string;

  /** Original filename as provided by the source. */
  @Column({ type: 'varchar', length: 512 })
  filename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 255, nullable: true, default: null })
  mimeType: string | null;

  /** Document size in bytes. */
  @Column({ type: 'int' })
  size: number;

  // --- Gmail-specific traceability (null for every other source) ---

  @Column({ name: 'gmail_message_id', type: 'varchar', length: 64, nullable: true, default: null })
  gmailMessageId: string | null;

  @Column({ name: 'gmail_thread_id', type: 'varchar', length: 64, nullable: true, default: null })
  gmailThreadId: string | null;

  /** Per-fetch Gmail id; long and regenerated on every fetch — informational only. */
  @Column({ name: 'gmail_attachment_id', type: 'text', nullable: true, default: null })
  gmailAttachmentId: string | null;

  @Column({ name: 'gmail_subject', type: 'varchar', length: 998, nullable: true, default: null })
  gmailSubject: string | null;

  @Column({ name: 'gmail_from', type: 'varchar', length: 512, nullable: true, default: null })
  gmailFrom: string | null;

  /** Raw Date header of the source email (provider format varies — kept as text). */
  @Column({ name: 'gmail_date', type: 'varchar', length: 64, nullable: true, default: null })
  gmailDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
