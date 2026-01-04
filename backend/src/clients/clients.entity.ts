import { Entity, Column, PrimaryGeneratedColumn, PrimaryColumn, Unique } from 'typeorm';

@Entity()
@Unique('uq_user_clientId', ['userId', 'name'])

export class Clients {

    @PrimaryGeneratedColumn('increment')
    clientRowId: number;

    @Column({ type: 'varchar', length: 9, default: '', nullable: true })
    id: string | null;

    @Column({ type: 'varchar', length: 255 })
    userId: string;

    @Column({ type: 'varchar', length: 255 })
    businessNumber: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    email: string | null;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    city: string | null;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    state: string | null;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    street: string | null;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    homeNumber: string | null;
}