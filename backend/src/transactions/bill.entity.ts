import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from 'src/users/user.entity';
import { Transactions } from './transactions.entity';

@Entity()
export class Bill {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  billName: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.bills)
  user: User;

  @OneToMany(() => Transactions, (transaction) => transaction.bill)
  transactions: Transactions[];
}