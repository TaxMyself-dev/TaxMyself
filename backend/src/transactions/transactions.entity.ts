import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne
} from 'typeorm'
import { DualMonthReport, SingleMonthReport } from 'src/enum';

@Entity()
export class Transactions {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  paymentIdentifier: string;

  @Column()
  billName: string;

  @Column()
  name: string;

  @Column('bigint')
  billDate: number;

  @Column('bigint')
  payDate: number;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column('boolean', { default: false })
  isRecognized: boolean;

  @Column()
  vatPercent: number;

  @Column()
  taxPercent: number;

  @Column('boolean', { default: false })
  isEquipment: boolean;

  @Column()
  reductionPercent: number;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

}