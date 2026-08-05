import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    OneToMany
 } from 'typeorm';
import { Bill } from '../transactions/bill.entity';
import { UserRole, TaxReportingType, VATReportingType, BusinessType, FamilyStatus, EmploymentType, Gender, BusinessStatus } from '../enum';


@Entity()
export class User {

    @PrimaryGeneratedColumn()
    index: number;

    ////////////////////////////////////
    ///////// Personal details /////////
    ////////////////////////////////////

    @Column()
    fName: string;

    /** Null for company users (no surname). */
    @Column({ type: 'varchar', nullable: true, default: null })
    lName: string | null;

    /** Personal ID (ת.ז) — null for company users. */
    @Column({ type: 'varchar', nullable: true, default: null })
    id: string | null;

    /** Null for company users (no personal gender). */
    @Column({
      type: 'enum',
      enum: Gender,
      enumName: 'Gender',
      nullable: true,
      default: null
    })
    gender: Gender | null;

    /** Null for company users (no date of birth). */
    @Column({ type: 'date', nullable: true, default: null })
    dateOfBirth: Date | null;

    @Column()
    phone: string;

    @Column()
    email: string;

    /** Null for company users (no personal city of residence). */
    @Column({ type: 'varchar', nullable: true, default: null })
    city: string | null;

    /** True for a company/partnership registration (skips spouse/children/personal fields). */
    @Column({ type: 'boolean', default: false })
    isCompany: boolean;

    @Column({ type: 'varchar', nullable: true, default: null })
    address: string | null;

    /** Null for company users (employment status is a personal concept). */
    @Column({
      type: 'enum',
      enum: EmploymentType,
      enumName: 'EmploymentType',
      nullable: true,
      default: null
    })
    employmentStatus: EmploymentType | null;

    /** Null for company users (family status is a personal concept). */
    @Column({
      type: 'enum',
      enum: FamilyStatus,
      enumName: 'FamilyStatus',
      nullable: true,
      default: null
    })
    familyStatus: FamilyStatus | null;

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

    @Column({ type: 'date', nullable: true, default: null })
    createdAt: Date;

    /** Timestamp of the current session's sign-in. Updated on every successful signin. */
    @Column({ type: 'datetime', nullable: true, default: null })
    lastLoginAt: Date | null;

    /** Timestamp of the sign-in BEFORE the current one. Used to show "last login was on ..." in the UI. */
    @Column({ type: 'datetime', nullable: true, default: null })
    previousLoginAt: Date | null;

    @Column({ type: 'int', default: 0 })
    userCount: number; // Number of users under an accountant or financial advisor 

    @Column()
    firebaseId: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    finsiteId: string | null;

    @Column({ default: false })
    hasOpenBanking: boolean;
    
    @Column({ name: 'drive_folder_id', type: 'varchar', length: 255, nullable: true, default: null })
    driveFolderId: string | null;

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