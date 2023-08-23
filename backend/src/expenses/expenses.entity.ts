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

    @Column({ type: 'date' })
    date_added: Date;
  
    @Column({ type: 'float', precision: 10, scale: 2 })
    price: number;
  
    @Column({ type: 'date' })
    date: Date;

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

    // @ManyToOne(() => User, (user) => user.expenses)
    // user: User;
}