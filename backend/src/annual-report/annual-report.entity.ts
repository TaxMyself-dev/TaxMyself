import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AnnualReportStatus {
  WAITING_FOR_DOCS = 'WAITING_FOR_DOCS',
  READY_TO_PREPARE = 'READY_TO_PREPARE',
  REPORTED = 'REPORTED',
}

export enum AnnualReportDocCategory {
  FORM_106 = 'FORM_106',
  SPOUSE_FORM_106 = 'SPOUSE_FORM_106',
  DONATION_RECEIPT = 'DONATION_RECEIPT',
  PENSION_867 = 'PENSION_867',
  LIFE_INSURANCE = 'LIFE_INSURANCE',
  RENTAL_INCOME = 'RENTAL_INCOME',
  INVESTMENT_867 = 'INVESTMENT_867',
  OTHER = 'OTHER',
}

/** רשומה ב-requiredCategories – קטגוריה ומינימום קבצים נדרש */
export interface RequiredCategoryEntry {
  category: AnnualReportDocCategory;
  minCount: number;
}

@Entity('annual_report')
@Index('ux_annual_report_year', ['businessNumber', 'taxYear'], { unique: true })
export class AnnualReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  clientFirebaseId: string;

  @Column({ type: 'varchar', length: 255 })
  businessNumber: string;

  @Column({ type: 'int' })
  taxYear: number;

  @Column({
    type: 'enum',
    enum: AnnualReportStatus,
    default: AnnualReportStatus.WAITING_FOR_DOCS,
  })
  status: AnnualReportStatus;

  @Column({ type: 'json', nullable: true })
  answers: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  requiredCategories: RequiredCategoryEntry[] | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  finishedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  reportedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  reportedByAccountantFirebaseId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
