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