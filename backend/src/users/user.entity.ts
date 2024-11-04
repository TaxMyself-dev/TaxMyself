import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType, FamilyStatus, EmploymentType } from '../enum';
import { UserCategory } from 'src/expenses/user-categories.entity';


@Entity()
export class User {
    @PrimaryGeneratedColumn()
    index: number;

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

    @Column()
    spouseFName: string;

    @Column()
    spouseLName: string;

    @Column()
    spouseId: string;

    @Column('date')
    spouseDateOfBirth: Date;

    @Column()
    spouseIndependet: boolean;

    @Column()
    firebaseId: string;

    @Column()
    businessName: string;

    @Column()
    businessField: string;

    @Column({
      type: 'enum',
      enum: BusinessType,
      enumName: 'BusinessType',
      default: BusinessType.EXEMPT
    })
    businessType: BusinessType;

    @Column()
    businessId: string;

    @Column()
    businessInventory: boolean;

    @Column('date')
    businessDate: Date;

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

    @Column({
      type: 'enum',
      enum: UserRole,
      enumName: 'UserRole',
      default: UserRole.FREE_USER
    })
    role: UserRole;

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

    @OneToMany(() => Bill, (bill) => bill.user)
    bills: Bill[];

}