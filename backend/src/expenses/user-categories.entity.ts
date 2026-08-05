import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * FROZEN legacy table (categories redesign): read-only since Phase 2.5,
 * fully UNREFERENCED at runtime since Phase 4.6 — registered only in
 * AppModule's forRoot entities list so the table stays schema-managed for
 * rollback. Dropped in Phase 7. Replaced by bookkeeping/category.entity.ts.
 */
@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column('boolean')
  isExpense: boolean;

  /**
   * User-level category account override (→ default_booking_account.code).
   * Checked in resolveAccountCode before the default category. NULL ⇒ no
   * override; resolver falls through to the default category / '5000'.
   */
  @Column({ nullable: true })
  accountCode: string;

}