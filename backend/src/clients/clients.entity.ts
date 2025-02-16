import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity()
export class Clients {

    @PrimaryGeneratedColumn() // Change primary key to userId and name
    id: number;


    //@PrimaryColumn()
    @Column()
    userId: string;


    //@PrimaryColumn()
    @Column()
    name: string;

    @Column()
    phone: string;

    @Column()
    email: string;

    @Column()
    address: string;

}