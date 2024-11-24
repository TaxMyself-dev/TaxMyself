import { SingleMonthReport, DualMonthReport } from 'src/enum';
import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
    BeforeInsert,
    BeforeUpdate
} from 'typeorm'

@Entity()
export class Expense {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplier: string;

  @Column()
  supplierID: string;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('date')
  date: Date;

  @Column()
  businessNumber: string;

  @Column({ nullable: true })
  note: string;

  @Column()
  file: string;

  @Column('boolean')
  isEquipment: boolean;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column()
  expenseNumber: string;

  @Column()
  reductionDone: number;

  @Column()
  reductionPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalTaxPayable: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalVatPayable: number;

  @Column('int')
  transId: number;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

  @Column('boolean')
  isReported: boolean;

  @BeforeInsert()
  @BeforeUpdate()
  calculateSums() {

    // Calculate the Vat and Tax Payable
    this.totalVatPayable = (this.sum/1.17) * 0.17 * (this.vatPercent/100);
    this.totalTaxPayable = (this.sum - this.totalVatPayable) * (this.taxPercent/100);


    // Calculate the last year for reduction
    let validDate = new Date(this.date);
    const purchaseYear = validDate.getFullYear();
    const purchaseMonth = validDate.getMonth() + 1; // Month is zero-based, so add 1
    // Determine total years required to fully apply reduction
    if (this.reductionPercent) {
      const fullReductionYears = Math.ceil(100 / this.reductionPercent);
      // Check if the purchase date is not at the start of the year
      const isPartialYear = purchaseMonth > 1 || this.date.getDate() > 1;
      // Calculate the last reduction year
      this.reductionDone = purchaseYear + fullReductionYears + (isPartialYear ? 1 : 0) - 1;
    }
    else {
      this.reductionDone = 0;
    }

  }

}