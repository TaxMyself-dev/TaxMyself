import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class Expense {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    amount!: number;

    @Column()
    date!: Date;

    @Column()
    category!: string;

    @Column()
    invoiceId!: string;

    @Column()
    type!: string;

    @ManyToOne(() => User, user => user.expenses)
    user!: User;
}
