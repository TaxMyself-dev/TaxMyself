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
    city: string;

     @Column()
    state: string;

     @Column()
    street: string;

     @Column()
    homeNumber: string;

     @Column()
    postalCode: string;

     @Column()
    stateCode: string;
}