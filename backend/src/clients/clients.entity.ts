import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Clients {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()   
    uid: string;

    @Column()
    clientName: string;

    @Column()
    phone: string;

    @Column()   
    email: string;

}