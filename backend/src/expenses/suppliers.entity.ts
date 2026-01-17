import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    ManyToOne 
} from 'typeorm'

@Entity()
export class Supplier {
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    supplier: string;

    @Column()
    category: string;

    @Column()
    supplierID: string;

    @Column()
    subCategory: string;

    @Column('decimal')
    taxPercent: number;
  
    @Column('decimal')
    vatPercent: number;

    @Column()
    userId: string;

    @Column()
    businessNumber: string;

    @Column()
    isEquipment: boolean;

    @Column()
    reductionPercent: number;

}