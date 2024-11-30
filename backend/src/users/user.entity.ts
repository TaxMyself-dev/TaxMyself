import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType, FamilyStatus, EmploymentType } from '../enum';


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

    @Column({
      type: 'enum',
      enum: UserRole,
      enumName: 'UserRole',
      default: UserRole.FREE_USER
    })
    role: UserRole;

    @Column()
    firebaseId: string;

    ////////////////////////////////////
    /////////   Spouse details  ////////
    ////////////////////////////////////

    @Column()
    spouseFName: string;

    @Column()
    spouseLName: string;

    @Column()
    spouseId: string;

    @Column('date')
    spouseDateOfBirth: Date;

    @Column()
    spousePhone: string;

    @Column({
      type: 'enum',
      enum: EmploymentType,
      enumName: 'EmploymentType',
      default: EmploymentType.SELF_EMPLOYED
    })
    spouseEmploymentStatus: EmploymentType;

    ////////////////////////////////////
    ////////  Buisness 1 details  //////
    ////////////////////////////////////

    @Column()
    businessName: string;

    @Column()
    businessField: string;

    @Column()
    businessNumber: string;

    @Column({
      type: 'enum',
      enum: BusinessType,
      enumName: 'BusinessType',
      default: BusinessType.EXEMPT
    })
    businessType: BusinessType;

    @Column()
    businessInventory: boolean;

    @Column('date')
    businessDate: Date;

    @Column({
      type: 'enum',
      enum: VATReportingType,
      enumName: 'VATReportingType',
      default: VATReportingType.NOT_REQUIRED
    })
    vatReportingType: VATReportingType;

    @Column({
      type: 'enum',
      enum: TaxReportingType,
      enumName: 'TaxReportingType',
      default: TaxReportingType.NOT_REQUIRED
    })
    taxReportingType: TaxReportingType;

    ////////////////////////////////////
    ////////  Buisness 2 details  //////
    ///////////////////////////////////

    @Column()
    spouseBusinessName: string;

    @Column()
    spouseBusinessField: string;

    @Column()
    spouseBusinessNumber: string;

    @Column({
      type: 'enum',
      enum: BusinessType,
      enumName: 'BusinessType',
      default: BusinessType.EXEMPT
    })
    spouseBusinessType: BusinessType;

    @Column()
    spouseBusinessInventory: boolean;

    @Column('date')
    spouseBusinessDate: Date;

    @Column({
      type: 'enum',
      enum: VATReportingType,
      enumName: 'VATReportingType',
      default: VATReportingType.NOT_REQUIRED
    })
    spouseVatReportingType: VATReportingType;

    @Column({
      type: 'enum',
      enum: TaxReportingType,
      enumName: 'TaxReportingType',
      default: TaxReportingType.NOT_REQUIRED
    })
    spouseTaxReportingType: TaxReportingType;

}