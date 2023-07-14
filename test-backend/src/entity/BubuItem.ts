import {Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity()
export class BubuItem {

    @PrimaryGeneratedColumn()
    id!: string;

    @Column()
    name!: string;

    @Column("float")
    price!: number;

    @Column()
    nickname!: string;
}
