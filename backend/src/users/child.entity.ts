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

    // @IsOptional()
    @Column({ type: 'varchar', nullable: true, default: null })
    childID: string;

    //@IsOptional()
    @Column('date')
    childDate: String;

    @Column()
    parentUserID: string;

}