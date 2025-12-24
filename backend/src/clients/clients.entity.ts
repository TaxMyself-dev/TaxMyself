import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity()
export class Clients {

    @Column({ type: 'varchar', length: 255, default: '' })
    id: string;

    //@PrimaryColumn()
    @PrimaryColumn({ type: 'varchar', length: 9 })
    userId: string;

    //@PrimaryColumn()
    @PrimaryColumn({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    phone: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    email: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    city: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    state: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    street: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    homeNumber: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    postalCode: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    stateCode: string;
}