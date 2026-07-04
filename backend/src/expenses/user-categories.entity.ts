import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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