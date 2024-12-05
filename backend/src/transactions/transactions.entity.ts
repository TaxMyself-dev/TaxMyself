import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
} from 'typeorm'
import { DualMonthReport, SingleMonthReport } from 'src/enum';

@Entity()
export class Transactions {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  finsiteId: string;

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

  @Column('date')
  payDate: Date;

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