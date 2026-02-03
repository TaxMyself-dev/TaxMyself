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

  // SHAAM OAuth tokens (encrypted with AES-256)
  @Column({ type: 'varchar', nullable: true, default: null })
  shaamAccessToken: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  shaamAccessTokenExp: string | null; // Unix timestamp as string (encrypted)

  @Column({ type: 'varchar', nullable: true, default: null })
  shaamRefreshToken: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankBeneficiary: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankName: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankBranch: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankAccount: string | null;

  // @Column({ type: 'varchar', nullable: true, default: null })
  // bankIban: string | null;
  
}