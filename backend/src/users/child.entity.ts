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
    fName: string;
    
    @Column()
    lName: string;

    @Column()
    id: string;

    @Column()
    dateOfBirth: string;

}