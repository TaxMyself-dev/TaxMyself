import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';

/**
 * FROZEN legacy table (categories redesign): read-only since Phase 2.5,
 * fully UNREFERENCED at runtime since Phase 4.6 — registered only in
 * AppModule's forRoot entities list so the table stays schema-managed for
 * rollback. Dropped in Phase 7. Replaced by bookkeeping/category.entity.ts.
 */
@Entity()
export class DefaultCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column('boolean')
  isExpense: boolean;

  /**
   * Category-level bookkeeping account code (→ default_booking_account.code).
   * Fallback in resolveAccountCode when a sub-category has no accountCode of
   * its own. NULL ⇒ category too broad to map; resolver falls back to '5000'.
   * Seeded on boot by AccountSeedService.
   */
  @Column({ nullable: true })
  accountCode: string;

}