import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn, Unique } from 'typeorm';

@Entity()
@Unique('uq_user_clientId', ['userId', 'id'])

export class Clients {

    @PrimaryGeneratedColumn('increment')
    clientRowId: number;

    @Column({ type: 'varchar', length: 9, default: '' })
    id: string;

    @Column({ type: 'varchar', length: 255 })
    userId: string;

    @Column({ type: 'varchar', length: 255 })
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