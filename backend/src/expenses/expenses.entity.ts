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

  @Column('date')
  date: Date;

  //Column('timestamp')
  //date: Date;

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

  @Column('date')
  loadingDate: Date;

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


  // @BeforeInsert()
  // @BeforeUpdate()
  // convertDateToTimestamp(): void {
  //   // Check if the date is a Date object and not already a timestamp
  //   if (this.date instanceof Date) {
  //     // Convert and overwrite the date with its timestamp
  //     this.date = this.date.getTime();
  //   }
  // }

  @BeforeInsert()
  @BeforeUpdate()
  calculateSums() {
    this.totalTaxPayable = this.sum * (this.taxPercent/100);
    this.totalVatPayable = (this.sum/1.17) * 0.17 * (this.vatPercent/100);
    // Ensure the date is a Date object before calling getTime()
    if (this.date instanceof Date) {
      this.dateTimestamp = Math.floor(this.date.getTime() / 1000);
    } else {
      console.error("this.date is not a valid Date object:", this.date);
        // Handle cases where this.date might not be a valid Date object
        // Perhaps set a default value or throw an error
    }
  }

}