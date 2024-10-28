import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { UserYearlyData } from './user-yearly-data.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType } from '../enum';


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

    @Column('bigint')
    dateOfBirth: number;

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

    @Column('bigint')
    spouseDateOfBirth: number;

    @Column()
    spouseIndependet: boolean;

    @Column()
    firebaseId: string;

    @Column()
    businessName: string;

    @Column()
    businessField: string;

    // @Column()
    // businessType: string;

    @Column({
      type: 'enum',
      enum: BusinessType,
      enumName: 'BusinessType', // Optional: allows TypeORM to name the enum type
      default: BusinessType.EXEMPT
    })
    businessType: BusinessType;

    @Column()
    businessId: string;

    @Column()
    businessInventory: boolean;

    @Column('bigint')
    businessDate: number;

    @Column()
    employee: boolean;

    @Column()
    familyStatus: string;

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.FREE_USER,
      })
      role: UserRole;

    @OneToMany(() => Bill, (bill) => bill.user)
    bills: Bill[];

    @OneToMany(() => UserSubCategory, userSubCategory => userSubCategory.user)
    userSubCategories: UserSubCategory[];

    @Column({
      type: 'enum',
      enum: VATReportingType,
      enumName: 'VATReportingType', // Optional: allows TypeORM to name the enum type
      default: VATReportingType.NOT_REQUIRED
    })
    vatReportingType: VATReportingType;

    @Column({
      type: 'enum',
      enum: TaxReportingType,
      enumName: 'TaxReportingType', // Optional: allows TypeORM to name the enum type
      default: TaxReportingType.NOT_REQUIRED
    })
    taxReportingType: TaxReportingType;

    @OneToMany(() => UserYearlyData, (yearlyData) => yearlyData.user)
    yearlyData: UserYearlyData[];

}