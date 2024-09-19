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

  @Column('decimal')
  sum: number;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('bigint')
  dateTimestamp: number;

  @Column({ nullable: true })
  note: string;

  @Column()
  file: string;

  @Column('boolean')
  isEquipment: boolean;

  @Column()
  userId: string;

  @Column('bigint')
  loadingDate: number;

  @Column()
  expenseNumber: string;

  @Column()
  reductionDone: boolean

  @Column()
  reductionPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalTaxPayable: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalVatPayable: number;

  @Column('int')
  monthReport: number;

  @Column('boolean')
  isReported: boolean;

  @BeforeInsert()
  @BeforeUpdate()
  calculateSums() {
    this.totalTaxPayable = this.sum * (this.taxPercent/100);
    this.totalVatPayable = (this.sum/1.17) * 0.17 * (this.vatPercent/100);

    // Calculate the monthReport field based on dateTimestamp
    this.calculateMonthReport();
  }

  private calculateMonthReport() {
    // Convert dateTimestamp to a JavaScript Date object
    const date = new Date(this.dateTimestamp * 1000); // dateTimestamp is in seconds, Date needs milliseconds
    // Get the month (JavaScript months are zero-indexed, so add 1)
    this.monthReport = date.getUTCMonth() + 1; // getUTCMonth() returns 0 for January, 1 for February, so we add 1
  }

}