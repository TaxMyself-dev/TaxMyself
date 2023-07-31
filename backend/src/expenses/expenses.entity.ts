import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne 
} from 'typeorm'
import { User } from 'src/users/user.entity';

@Entity()
export class Expense {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    price: number;

    @Column()
    date: string;

    @Column()
    supplier: string;

    @Column()
    category: string;

    @Column()
    tax_percent: number;

    @Column()
    vat_percent: number;

    @Column()
    equipment: boolean;

    @ManyToOne(() => User, (user) => user.reports)
    user: User;
}