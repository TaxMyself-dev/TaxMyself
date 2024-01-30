import { Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity()
export class DefaultCategory {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    subCategory: string;

    @Column()
    category: string;

    @Column('decimal')
    taxPercent: number;
  
    @Column('decimal')
    vatPercent: number;

    @Column('boolean')
    isEquipment: boolean;

}