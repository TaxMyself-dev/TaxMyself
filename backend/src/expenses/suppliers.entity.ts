import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index
} from 'typeorm'

/**
 * Per-business uniqueness: at most one supplier row per
 * (businessNumber, supplierID). MySQL treats NULL as distinct in a
 * composite UNIQUE, so foreign vendors / cash receipts without an
 * Israeli tax ID (supplierID IS NULL) can coexist without colliding.
 * The application-level dedup in expenses.service.ts mirrors this key
 * — the index is the safety net against races (double-click,
 * concurrent tabs) where two find-or-create checks both miss.
 */
@Index('uq_supplier_business_supplierid', ['businessNumber', 'supplierID'], { unique: true })
@Entity()
export class Supplier {
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    supplier: string;

    @Column()
    category: string;

    @Column({ nullable: true })
    supplierID: string | null;

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