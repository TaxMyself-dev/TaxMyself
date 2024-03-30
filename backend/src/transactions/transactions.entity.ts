import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn 
} from 'typeorm'

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

}