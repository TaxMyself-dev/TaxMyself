import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AnnualReportDocCategory } from './annual-report.entity';

@Entity('annual_report_file')
@Index('ix_annual_report_file_report', ['annualReportId'])
export class AnnualReportFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  annualReportId: number;

  @Column({ type: 'enum', enum: AnnualReportDocCategory })
  category: AnnualReportDocCategory;

  @Column({ type: 'varchar', length: 1024 })
  filePath: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 255 })
  uploadedByFirebaseId: string;

  @CreateDateColumn()
  uploadedAt: Date;
}
