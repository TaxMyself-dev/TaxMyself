import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { OwnerType, VisibilityScope, SYSTEM_CHART_OWNER_KEY } from 'src/enum';
import { AccountingSection } from './accounting-section.entity';

/**
 * כרטיס — journal posting target (D1 of the categories redesign). Renamed
 * from DefaultBookingAccount / table default_booking_account (D1.2);
 * production rename happens via Phase 1.4's migration script, not
 * TypeORM synchronize.
 */
@Entity('booking_account')
@Unique(['chartOwnerKey', 'code'])
export class BookingAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column()
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';

  /** Which P&L report line this account maps to. NULL = technical account
   *  that does not appear in the P&L (e.g. clearing / VAT accounts).
   *  TEMPORARY (D1.2) — superseded by `section`/`sectionId`; dropped Phase 7
   *  once createPnLReportFromJournal reads sectionId instead (Phase 4.4). */
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
