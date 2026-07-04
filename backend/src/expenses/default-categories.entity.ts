import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';

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