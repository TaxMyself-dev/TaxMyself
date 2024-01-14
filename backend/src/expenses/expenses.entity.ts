import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne 
} from 'typeorm'
import { User } from 'src/users/user.entity';

//import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Expense {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplier: string;

  @Column()
  category: string;

  @Column('decimal')
  sum: number;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('date')
  date: Date;

  @Column('date')
  loadingDate: Date;

  @Column({ nullable: true })
  note: string;

  @Column()
  file: string;

  @Column('boolean')
  equipment: boolean;

  @Column()
  userId: string;

  @Column()
  expenseNumber: string;

  @Column()
  supplierID: string

  //@ManyToOne(() => User, (user) => user.expenses)
  //user: string;

}


// @Entity()
// export class Expense {
//     @PrimaryGeneratedColumn()
//     id: number;

//     @Column({ type: 'date' })
//     date_added: Date;
  
//     @Column({ type: 'float', precision: 10, scale: 2 })
//     price: number;
  
//     @Column({ type: 'date' })
//     date: Date;

//     @Column()
//     supplier: string;

//     @Column()
//     category: string;

//     @Column()
//     tax_percent: number;

//     @Column()
//     vat_percent: number;

//     @Column()
//     equipment: boolean;

//     // @ManyToOne(() => User, (user) => user.expenses)
//     // user: User;
// }