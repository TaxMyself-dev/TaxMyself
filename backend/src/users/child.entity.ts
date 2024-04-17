import { IsOptional } from 'class-validator';
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

    @IsOptional()
    @Column('date')
    childDate: String;

    @Column()
    fatherID: string;

}