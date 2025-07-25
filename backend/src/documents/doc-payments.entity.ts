import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { CardCompany, CreditTransactionType, PaymentMethodType, UnitOfMeasure, VatOptions } from 'src/enum';


@Entity()
export class DocPayments {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  issuerbusinessNumber: string;

  @Column({ type: 'varchar', length: 4, nullable: true })
  paymentLineNumber: string;

  @Column({ type: 'enum', enum: PaymentMethodType })
  paymentMethod: PaymentMethodType;

  @Column({ type: 'varchar', length: 10, nullable: true })
  bankNumber: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  branchNumber: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  accountNumber: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  checkNumber: string;

  @Column({ type: 'date', nullable: true })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  lineSum: number;

  @Column({ type: 'enum', enum: CardCompany, nullable: true })
  cardCompany: CardCompany;

  @Column({ type: 'varchar', length: 20, nullable: true })
  creditCardName: string; // שם הכרטיס הסולק

  @Column({ type: 'enum', enum: CreditTransactionType, nullable: true })
  creditTransType: CreditTransactionType; // סוג עסקת האשראי

  @Column({ type: 'varchar', length: 4, nullable: true })
  card4Number: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  creditPayNumber: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  generalDocIndex: string;
  
}
