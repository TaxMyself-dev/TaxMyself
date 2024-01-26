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

  @Column('decimal')
  sum: number;

  @Column('date')
  date: Date;

  @Column()
  userId: string;

}