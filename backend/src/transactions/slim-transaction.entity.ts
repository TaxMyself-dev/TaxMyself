import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReportPeriodLabel } from 'src/enum';
import { ClassificationType } from './enums/classification-type.enum';

@Entity('slim_transactions')
@Index('UQ_slim_user_external', ['userId', 'externalTransactionId'], { unique: true })
@Index('IDX_slim_userId', ['userId'])
export class SlimTransaction {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  externalTransactionId: string;

  @Column({ type: 'varchar' })
  userId: string;

  /**
   * Required. Classification is account-specific.
   * A slim row must never exist without a billId.
   * Enforced at service layer: transactions without billId are cache-only.
   */
  @Column({ type: 'int' })
  billId: number;

  @Column({
    type: 'enum',
    enum: ClassificationType,
  })
  classificationType: ClassificationType;

  /**
   * References the classified_transactions rule that produced this classification.
   * Null for ONE_TIME classifications.
   */
  @Column({ type: 'int', nullable: true, default: null })
  classificationRuleId: number | null;

  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar' })
  subCategory: string;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @Column({ type: 'int', default: 0 })
  taxPercent: number;

  @Column({ type: 'int', default: 0 })
  vatPercent: number;

  /**
   * Period label for the report this transaction belongs to.
   * Set on confirm-trans (saveTransactionsToExpenses) — represents "this
   * transaction was reported under report period X". On its own this does
   * NOT lock the transaction; the user/accountant can still re-classify.
   * Format: "M/YYYY", "M1-M2/YYYY", or "YYYY" — see ReportPeriodLabel.
   */
  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: ReportPeriodLabel | null;

  /**
   * Hard lock flag — true once the report covering this transaction has
   * been officially submitted (self-employed: "סמן כדווח" button on the
   * VAT/PnL page; accountant: setReported workflow action). When true the
   * classification guard in TransactionProcessingService blocks further
   * edits. Independent of vatReportingDate so the period stamp can show
   * before the lock icon does.
   */
  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'int', default: 0 })
  reductionPercent: number;

  @Column({ type: 'boolean', default: false })
  isEquipment: boolean;

  @Column({ type: 'boolean', default: false })
  isRecognized: boolean;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

