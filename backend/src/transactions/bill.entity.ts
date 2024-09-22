import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../users/user.entity';
//import { Transactions } from './transactions.entity';
import { Source } from './source.entity';

@Entity()
export class Bill {


  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  billName: string;

  @Column()
  userId: string; // Association with the user

  @OneToMany(type => Source, source => source.bill)
  sources: Source[];

  @ManyToOne(() => User, (user) => user.bills)
  user: User;

  //@OneToMany(() => Transactions, (transaction) => transaction.bill)
  //transactions: Transactions[];
}