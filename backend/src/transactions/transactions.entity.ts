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
  name: string;

  @Column('timestamp')
  billDate: Date;

  @Column('timestamp')
  payDate: Date;

  @Column('decimal')
  sum: number;

  @Column()
  category: string;

  @Column()
  userId: string;

  //@ManyToOne(() => Bill, (bill) => bill.transactions)
  //bill: Bill;

}