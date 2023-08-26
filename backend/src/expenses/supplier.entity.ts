import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne 
} from 'typeorm'
import { User } from 'src/users/user.entity';

@Entity()
export class Supplier {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    supplier: string;

    @Column()
    category: string;

    @Column()
    tax_percent: number;

    @Column()
    vat_percent: number;

    // @ManyToOne(() => User, (user) => user.expenses)
    // user: User;
}