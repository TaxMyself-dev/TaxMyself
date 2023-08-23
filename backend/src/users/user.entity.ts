import { 
    AfterInsert, 
    AfterRemove, 
    AfterUpdate, 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Report } from 'src/reports/report.entity';
import { Expense } from 'src/expenses/expenses.entity';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    index: number;

    @Column()
    fName: string;
    
    @Column()
    lName: string;

    @Column()
    id: string;

    @Column()
    email: string;

    @Column()
    phone: string;

    @Column()
    dateOfBirth: string;

    //children

    @Column()
    spouseFName: string;

    @Column()
    spouseLName: string;

    @Column()
    spouseId: string;

    @Column()
    spouseDateOfBirth: string;

    @Column()
    firebaseId: string;

    //@OneToMany(() => Expense, (expense) => expense.user)
    //expenses: Expense[];

    @AfterInsert()
    logInsert() {
        console.log('Inserted user with id', this.index);
    }

    @AfterUpdate()
    logUpdate() {
        console.log('Updated user with id', this.index);
    }

    @AfterRemove()
    logRemove() {
        console.log('Removed user with id', this.index);
    }
}