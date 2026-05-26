import { ExpenseNecessity, ExpenseReportScope } from 'src/enum';
import { Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity()
export class DefaultSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subCategoryName: string;

  @Column()
  categoryName: string;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('decimal')
  reductionPercent: number;

  @Column('boolean')
  isEquipment: boolean;

  @Column('boolean')
  isRecognized: boolean;

  @Column('boolean')
  isExpense: boolean;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  /** Does this subcategory go to the P&L or only to the annual report. */
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

  /** P&L presentation category override (NULL ⇒ use the bookkeeping category). */
  @Column({ type: 'varchar', nullable: true, default: null })
  pnlCategory: string | null;

}