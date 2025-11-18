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

  @Column()
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

  @Column({ nullable: true })
  note: string;

  @Column({ nullable: true, default: null })
  file: string;

  @Column('boolean')
  isEquipment: boolean;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column()
  expenseNumber: string;

  @Column()
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