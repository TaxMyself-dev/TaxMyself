import { ExpenseNecessity } from 'src/enum';
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'

/**
 * Stores smart classification rules.
 *
 * transactionName = the merchant identifier used for rule matching.
 * Multiple rules for the same merchant are allowed when their smart-matching
 * conditions (commentPattern, sum range, date range) differ.
 *
 * Rule precedence (deterministic):
 *   1. Filter rules that fully match the transaction.
 *   2. Score each matched rule (+1 per condition defined: commentPattern,
 *      sum range, date range). Higher score wins.
 *   3. Tie-break: newest updatedAt wins.
 */
@Entity()
@Index('IDX_rule_user_bill_merchant', ['userId', 'billId', 'transactionName'])
export class ClassifiedTransactions {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  /** Merchant identifier used for rule matching. */
  @Column()
  transactionName: string;

  @Column({ type: 'int' })
  billId: number;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  @Column()
  isExpense: boolean;

  @Column()
  isRecognized: boolean;

  @Column()
  vatPercent: number;

  @Column()
  taxPercent: number;

  @Column()
  isEquipment: boolean;

  @Column()
  reductionPercent: number;

  @Column({ type: 'date', nullable: true, default: null })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true, default: null })
  endDate: Date | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: null })
  minAbsSum: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: null })
  maxAbsSum: number | null;

  @Column({ nullable: true, default: null })
  commentPattern: string | null;

  @Column({
    type: 'enum',
    enum: ['equals', 'contains'],
    default: 'equals',
  })
  commentMatchType: 'equals' | 'contains';

  /** Used as tie-breaker in rule selection: newest updatedAt wins. */
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

}
