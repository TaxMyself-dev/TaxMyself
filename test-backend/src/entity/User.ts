import {Entity, Unique, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';
import { Expense } from './Expense';
import { Income } from './Income';

@Entity()
@Unique(["email"])
export class User {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    firstName!: string;

    @Column()
    lastName!: string;

    @Column()
    password!: string;

    @Column()
    email!: string;

    @OneToMany(() => Expense, expense => expense.user)
    expenses!: Expense[];

    @OneToMany(() => Income, income => income.user)
    incomes!: Income[];
}
