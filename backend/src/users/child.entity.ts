import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn
 } from 'typeorm';

@Entity()
export class Child {

    @PrimaryGeneratedColumn()
    index: number;

    @Column()
    childFName: string;
    
    @Column()
    childLName: string;

    @Column()
    childID: string;

    @Column('date')
    childDate: Date;

    @Column()
    fatherID: string;

}