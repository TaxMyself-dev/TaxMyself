import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
} from 'typeorm'
import { DualMonthReport, ExpenseNecessity, SingleMonthReport } from 'src/enum';

@Entity()
export class Transactions {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  finsiteId: string | null;

  @Column()
  userId: string;

  @Column()
  paymentIdentifier: string;

  @Column({ nullable: true })
  billName: string | null;

  @Column({ nullable: true })
  businessNumber: string | null;

  @Column()
  name: string;

  @Column({ nullable: true })
  note2: string | null;

  @Column('date')
  billDate: Date;

  @Column({ type: 'date', nullable: true, default: null })
  payDate: Date | null;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  category: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  subCategory: string | null;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;
  
  @Column({ type: 'boolean', nullable: true, default: false })
  isRecognized: boolean | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  vatPercent: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  taxPercent: number | null;

  @Column({ type: 'boolean', nullable: true, default: false })
  isEquipment: boolean | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  reductionPercent: number | null;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

}