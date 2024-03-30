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

  //@Column('date')
  //date: Date;

  @Column('timestamp')
  date: Date;

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

  @BeforeInsert()
  @BeforeUpdate()
  calculateSums() {
    this.totalTaxPayable = this.sum * (this.taxPercent/100);
    this.totalVatPayable = (this.sum/1.17) * 0.17 * (this.vatPercent/100);
  }

}