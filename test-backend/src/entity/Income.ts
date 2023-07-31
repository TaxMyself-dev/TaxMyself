import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class Income {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    amount!: number;

    @Column()
    date!: Date;

    @Column()
    receiptId!: string;

    @ManyToOne(() => User, user => user.expenses)
    user!: User;
}
