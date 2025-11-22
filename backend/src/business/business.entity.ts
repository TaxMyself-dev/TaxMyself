import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, BeforeInsert } from 'typeorm';
import { BusinessType, Currency, DocumentType, TaxReportingType, VATReportingType } from 'src/enum';


@Entity()
export class Business {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessName: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessField: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessNumber: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessAddress: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessPhone: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessEmail: string | null;

  @Column({
    type: 'enum',
    enum: BusinessType,
    enumName: 'BusinessType',
    nullable: true,
    default: BusinessType.EXEMPT
  })
  businessType: BusinessType | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  businessInventory: boolean | null;

  @Column({ type: 'date', nullable: true, default: null })
  businessDate: Date | null;

  @Column({
    type: 'enum',
    enum: VATReportingType,
    enumName: 'VATReportingType',
    nullable: true,
    default: VATReportingType.NOT_REQUIRED
  })
  vatReportingType: VATReportingType | null;
  
  @Column({
    type: 'enum',
    enum: TaxReportingType,
    enumName: 'TaxReportingType',
    nullable: true,
    default: TaxReportingType.NOT_REQUIRED
  })
  taxReportingType: TaxReportingType | null;
  
}