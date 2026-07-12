import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { OwnerType, VisibilityScope, SYSTEM_CHART_OWNER_KEY, RecognitionType } from 'src/enum';
import { AccountingSection } from './accounting-section.entity';

/**
 * כרטיס — journal posting target (D1 of the categories redesign). Renamed
 * from DefaultBookingAccount / table default_booking_account (D1.2);
 * production rename happens via Phase 1.4's migration script, not
 * TypeORM synchronize.
 */
// Named explicitly to match 2026-07-10_chart_renumber.sql — see
// schema-drift.md Gap 7 (2026-07-12 incident: an unnamed decorator here got
// dropped by an accidental synchronize run and never recreated).
@Entity('booking_account')
@Unique('uq_booking_account_owner_code', ['chartOwnerKey', 'code'])
export class BookingAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column()
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';

  /** DEAD as of Phase 4.4 — createPnLReportFromJournal now groups by
   *  `section`/`sectionId` (D3); no runtime code reads pnlCategory anymore.
   *  Column kept (with its seed values) purely for rollback until the
   *  Phase 7 drop. */
  @Column({ nullable: true })
  pnlCategory: string | null;

  /** Sort order within the P&L report. TEMPORARY (D1.2), dropped Phase 7 —
   *  superseded by `section.displayOrder`. */
  @Column({ nullable: true })
  displayOrder: number | null;

  @ManyToOne(() => AccountingSection, { nullable: true })
  @JoinColumn({ name: 'sectionId' })
  section: AccountingSection | null;

  @Column({ type: 'int', nullable: true, default: null })
  sectionId: number | null;

  /** Form 6111 field code (official Tax Authority uniform classification).
   *  NULL = not yet sourced — never invent a value here (D2/1.3). */
  @Column({ nullable: true, default: null })
  code6111: string | null;

  /**
   * The card carries the FULL accounting law (revised D1/D5, 2026-07-10):
   * VAT/tax deductibility, equipment/depreciation, and business recognition
   * all live here instead of on `sub_category`. NULL on every non-expense
   * account (income, balance-sheet, technical 90000-range) — these fields
   * are not applicable there, same NULL-means-"not applicable" convention
   * as `code6111`. Two sub_categories with different percent combinations
   * are, by definition, two different cards (D1) — never encode a second
   * treatment by overloading one account's percents.
   */
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null })
  vatPercent: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null })
  taxPercent: number | null;

  /** Depreciation rate — only meaningful when `isEquipment` is true. */
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null })
  reductionPercent: number | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isEquipment: boolean | null;

  /** NOT_RECOGNIZED cards still post to the ledger but are excluded from
   *  deductible totals (D5) — distinct from `sub_category.isPrivate`, which
   *  means no card at all. NULL on non-expense accounts. */
  @Column({ type: 'enum', enum: RecognitionType, nullable: true, default: null })
  recognitionType: RecognitionType | null;

  @Column({ type: 'enum', enum: OwnerType, default: OwnerType.SYSTEM })
  ownerType: OwnerType;

  @Column({ default: SYSTEM_CHART_OWNER_KEY })
  chartOwnerKey: string;

  /** Agent firebaseId when ownerType=ACCOUNTANT, or creator when accountant-created for a client. */
  @Column({ nullable: true, default: null })
  accountantId: string | null;

  /** Client firebaseId when ownerType=CLIENT. */
  @Column({ nullable: true, default: null })
  userId: string | null;

  @Column({ nullable: true, default: null })
  businessNumber: string | null;

  @Column({ type: 'enum', enum: VisibilityScope, nullable: true, default: null })
  visibilityScope: VisibilityScope | null;

  @Column({ default: true })
  isActive: boolean;

}
