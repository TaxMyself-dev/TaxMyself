import { ExpenseNecessity } from 'src/enum';
import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn
} from 'typeorm'

@Entity()
export class ClassifiedTransactions {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  transactionName: string;

  @Column()
  billName: string;

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
  minAbsSum: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: null })
  maxAbsSum: number;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // comment: string | null;

  @Column({ nullable: true })
  commentPattern?: string; // the keyword or exact comment

  @Column({
    type: 'enum',
    enum: ['equals', 'contains'],
    default: 'equals',
  })
  commentMatchType: 'equals' | 'contains';

}