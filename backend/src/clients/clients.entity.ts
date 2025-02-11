import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Clients {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()   
    userId: string;

    @Column()
    name: string;

    @Column()
    phone: string;

    @Column()   
    email: string;

    @Column()   
    address: string;

}