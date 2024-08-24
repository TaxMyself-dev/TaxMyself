import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne
} from 'typeorm'
import { Bill } from './bill.entity';

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

}