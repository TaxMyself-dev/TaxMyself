import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType, FamilyStatus, EmploymentType, PayStatus } from '../enum';


@Entity()
export class User {

    @PrimaryGeneratedColumn()
    index: number;

    ////////////////////////////////////
    ///////// Personal details /////////
    ////////////////////////////////////

    @Column()
    fName: string;
    
    @Column()
    lName: string;

    @Column()
    id: string;

    @Column('date')
    dateOfBirth: Date;

    @Column()
    phone: string;

    @Column()
    email: string;

    @Column()
    city: string;

    @Column({
      type: 'enum',
      enum: EmploymentType,
      enumName: 'EmploymentType',
      default: EmploymentType.SELF_EMPLOYED
    })
    employmentStatus: EmploymentType;

    @Column({
      type: 'enum',
      enum: FamilyStatus,
      enumName: 'FamilyStatus',
      default: FamilyStatus.SINGLE
    })
    familyStatus: FamilyStatus;

    @OneToMany(() => Bill, (bill) => bill.user)
    bills: Bill[];

    @Column()
    isTwoBusinessOwner: boolean;

    // @Column({
    //   type: 'enum',
    //   enum: UserRole,
    //   enumName: 'UserRole',
    //   default: UserRole.FREE_USER
    // })
    // role: UserRole;

    @Column({
      type: 'simple-array', // Store as a comma-separated string
    })
    role: UserRole[];

    @Column({
      type: 'enum',
      enum: PayStatus,
      enumName: 'PayStatus',
      default: PayStatus.FREE, // Default to FREE
    })
    payStatus: PayStatus;

    @Column()
    firebaseId: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    finsiteId: string | null;

    ////////////////////////////////////
    /////////   Spouse details  ////////
    ////////////////////////////////////

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseFName: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseLName: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseId: string | null;

    @Column({ type: 'date', nullable: true, default: null })
    spouseDateOfBirth: Date | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spousePhone: string | null;

    @Column({
      type: 'enum',
      enum: EmploymentType,
      enumName: 'EmploymentType',
      nullable: true,
      default: EmploymentType.SELF_EMPLOYED
    })
    spouseEmploymentStatus: EmploymentType | null;

    ////////////////////////////////////
    ////////  Buisness 1 details  //////
    ////////////////////////////////////

    @Column({ type: 'varchar', nullable: true, default: null })
    businessName: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    businessField: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    businessNumber: string | null;

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

    ////////////////////////////////////
    ////////  Buisness 2 details  //////
    ///////////////////////////////////

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseBusinessName: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseBusinessField: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseBusinessNumber: string | null;

    @Column({
      type: 'enum',
      enum: BusinessType,
      enumName: 'BusinessType',
      nullable: true,
      default: BusinessType.EXEMPT
    })
    spouseBusinessType: BusinessType | null;

    @Column({ type: 'boolean', nullable: true, default: null })
    spouseBusinessInventory: boolean | null;

    @Column({ type: 'date', nullable: true, default: null })
    spouseBusinessDate: Date | null;

    @Column({
      type: 'enum',
      enum: VATReportingType,
      enumName: 'VATReportingType',
      nullable: true,
      default: VATReportingType.NOT_REQUIRED
    })
    spouseVatReportingType: VATReportingType | null;

    @Column({
      type: 'enum',
      enum: TaxReportingType,
      enumName: 'TaxReportingType',
      nullable: true,
      default: TaxReportingType.NOT_REQUIRED
    })
    spouseTaxReportingType: TaxReportingType | null;

}