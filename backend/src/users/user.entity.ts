import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType, FamilyStatus, EmploymentType, PayStatus, ModuleName, Gender, BusinessStatus } from '../enum';


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

    @Column({
      type: 'enum',
      enum: Gender,
      enumName: 'Gender',
      default: Gender.MALE
    })
    gender: Gender;

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

    @Column({
      type: 'enum',
      enum: BusinessStatus,
      enumName: 'BusinessStatus',
      default: BusinessStatus.NO_BUSINESS
    })
    businessStatus: BusinessStatus;

    @Column({
      type: 'simple-array',
    })
    role: UserRole[];

    @Column({
      type: 'enum',
      enum: PayStatus,
      enumName: 'PayStatus',
      default: PayStatus.TRIAL
    })
    payStatus: PayStatus;

    @Column({ type: 'simple-array', nullable: true })
    modulesAccess: ModuleName[];
  
    @Column({ type: 'date', nullable: true, default: null })
    subscriptionEndDate: Date;
  
    @Column({ type: 'date', nullable: true, default: null })
    nextBillingDate: Date;

    @Column({ type: 'date', nullable: true, default: null })
    createdAt: Date;

    @Column({ type: 'int', default: 0 })
    userCount: number; // Number of users under an accountant or financial advisor 

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

    @Column({
      type: 'enum',
      enum: Gender,
      enumName: 'Gender',
      nullable: true,
      default: null
    })
    spouseGender: Gender;

    @Column({ type: 'date', nullable: true, default: null })
    spouseDateOfBirth: Date | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spousePhone: string | null;

    @Column({ type: 'varchar', nullable: true, default: null })
    spouseEmail: string | null;

    @Column({
      type: 'enum',
      enum: EmploymentType,
      enumName: 'EmploymentType',
      nullable: true,
      default: null
    })
    spouseEmploymentStatus: EmploymentType | null;

}