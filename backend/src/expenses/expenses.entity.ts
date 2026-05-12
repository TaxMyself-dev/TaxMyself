import { SingleMonthReport, DualMonthReport } from 'src/enum';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity()
export class Expense {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplier: string;

  @Column({ nullable: true, default: null })
  supplierID: string;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('date')
  date: Date;

  @Column()
  businessNumber: string;

  @Column({ nullable: true, default: null })
  note: string;

  @Column({ nullable: true, default: null })
  file: string;

  @Column('boolean')
  isEquipment: boolean;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column({ nullable: true, default: null })
  expenseNumber: string;

  @Column({ nullable: true, default: null })
  reductionDone: number;

  @Column()
  reductionPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalTaxPayable: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalVatPayable: number;

  @Column({
    type: 'int',
    nullable: true,
    default: null,
  })
  transId: number;

  /**
   * Stable identity of the source cache/slim transaction this Expense row
   * was created from. Used to keep the Expense in sync when the user
   * re-classifies a confirmed-but-not-yet-locked transaction.
   * Null for legacy Expenses created before this link existed, or for rows
   * added manually (not from a bank/card transaction).
   */
  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  externalTransactionId: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

  @Column({
    type: 'boolean',
    nullable: true,
    default: null,
  })
  isReported: boolean;

}