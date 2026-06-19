import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { BusinessType, TaxReportingType, VATReportingType } from 'src/enum';


@Entity('business')
export class Business {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessName: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessField: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessNumber: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessAddress: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessPhone: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessEmail: string | null;

  @Column({
    type: 'enum',
    enum: BusinessType,
    enumName: 'BusinessType',
    nullable: true,
    default: BusinessType.EXEMPT
  })
  businessType: BusinessType | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  businessInventory: boolean | null;

  @Column({ type: 'date', nullable: true, default: null })
  businessDate: Date | null;

  @Column({
    type: 'enum',
    enum: VATReportingType,
    enumName: 'VATReportingType',
    nullable: true,
    default: VATReportingType.NOT_REQUIRED
  })
  vatReportingType: VATReportingType | null;
  
  @Column({
    type: 'enum',
    enum: TaxReportingType,
    enumName: 'TaxReportingType',
    nullable: true,
    default: TaxReportingType.DUAL_MONTH_REPORT
  })
  taxReportingType: TaxReportingType | null;

  @Column({ type: 'boolean', nullable: true, default: false })
  nationalInsRequired: boolean | null;

  /** אחוז מקדמות מס הכנסה (משתנה בין עסק לעסק) */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, default: null })
  advanceTaxPercent: number | null;

  // SHAAM OAuth tokens (encrypted with AES-256)
  @Column({ type: 'varchar', nullable: true, default: null })
  shaamAccessToken: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  shaamAccessTokenExp: string | null; // Unix timestamp as string (encrypted)

  @Column({ type: 'varchar', nullable: true, default: null })
  shaamRefreshToken: string | null;

  /**
   * When this business was added to the app. Used as the lower bound for
   * auto-generating recurring tasks/workflows so historical periods don't
   * appear before the business existed in the system.
   * Existing rows get NOW() at schema-apply time (TypeORM default for
   * @CreateDateColumn) — they won't auto-backfill historical periods. To
   * backfill an existing business, set this column to a past date.
   */
  @CreateDateColumn()
  createdAt: Date;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankBeneficiary: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankName: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankBranch: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankAccount: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankIban: string | null;

  // Google Drive folder id for this business — created lazily on first sync.
  // Parent folder is the user's root Drive folder (user.drive_folder_id).
  @Column({ name: 'drive_folder_id', type: 'varchar', length: 255, nullable: true, default: null })
  driveFolderId: string | null;

  // Two fixed sub-folders under driveFolderId. Populated by
  // UsersService.provisionDriveStructure() on signup/business-create, and by
  // the admin backfill endpoint for existing businesses. Files dropped into
  // `inbox/` get OCR'd on the next report-page visit; OK files move to
  // `processed/`.
  @Column({ name: 'drive_inbox_folder_id', type: 'varchar', length: 255, nullable: true, default: null })
  driveInboxFolderId: string | null;

  @Column({ name: 'drive_processed_folder_id', type: 'varchar', length: 255, nullable: true, default: null })
  driveProcessedFolderId: string | null;
}