import { ExpenseNecessity, ExpenseReportScope } from 'src/enum';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * FROZEN legacy table (categories redesign): read-only since Phase 2.5,
 * fully UNREFERENCED at runtime since Phase 4.6 — registered only in
 * AppModule's forRoot entities list so the table stays schema-managed for
 * rollback. Dropped in Phase 7. Replaced by bookkeeping/sub-category.entity.ts.
 */
@Entity()
export class UserSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column()
  subCategoryName: string;

  @Column()
  categoryName: string;

  @Column('decimal', { precision: 5, scale: 2 })
  taxPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  vatPercent: number;

  @Column('decimal', { precision: 5, scale: 2 })
  reductionPercent: number;

  @Column('boolean')
  isEquipment: boolean;

  @Column('boolean')
  isRecognized: boolean;

  @Column('boolean')
  isExpense: boolean;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  /** Does this subcategory go to the P&L or only to the annual report. */
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

  /** P&L presentation category override (NULL ⇒ use the bookkeeping category). */
  @Column({ type: 'varchar', nullable: true, default: null })
  pnlCategory: string | null;

  /**
   * Bookkeeping account code for journal posting (→ default_booking_account.code).
   * Populated on boot by AccountSeedService from pnlCategory; NULL ⇒ caller
   * falls back to '5000'.
   */
  @Column({ nullable: true })
  accountCode: string;

}