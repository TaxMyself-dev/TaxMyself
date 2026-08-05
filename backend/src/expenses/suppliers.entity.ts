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

    /**
     * Nullable pointer at sub_category.id (D6/Phase 3.1) — display-only, no
     * DB FK constraint (matching the established no-real-FK precedent for
     * catalog pointers, e.g. sub_category.categoryId/accountId). Backfilled
     * by name within scope in Phase 3.5; unmatched -> stays NULL.
     * `category`/`subCategory` strings above remain the source of read
     * paths until Phase 4.
     */
    @Column({ type: 'int', nullable: true, default: null })
    subCategoryId: number | null;

}