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
    category: string;

    @Column('decimal')
    taxPercent: number;
  
    @Column('decimal')
    vatPercent: number;

    @Column()
    userId: string;

    // @ManyToOne(() => User, (user) => user.expenses)
    // user: User;
}