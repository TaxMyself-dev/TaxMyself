import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class DefaultBookingAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';

  /** Which P&L report line this account maps to. NULL = technical account
   *  that does not appear in the P&L (e.g. clearing / VAT accounts). */
  @Column({ nullable: true })
  pnlCategory: string | null;

  /** Sort order within the P&L report. NULL for technical accounts. */
  @Column({ nullable: true })
  displayOrder: number | null;

}
