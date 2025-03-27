import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { CardCompany, CreditTransactionType, PaymentMethodType, UnitOfMeasure, VatOptions } from 'src/enum';


@Entity()
export class DocLines {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  issuerbusinessNumber: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  generalDocIndex: string;

  @Column()
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  unitAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  sumBefVat: number;

  @Column({ type: 'enum', enum: VatOptions, default: VatOptions.INCLUDE })
  vatOpts: VatOptions;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  vatRate: number;

  @Column({ type: 'enum', enum: PaymentMethodType })
  paymentMethod: PaymentMethodType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  discount: number;

  @Column({ type: 'varchar', length: 4, nullable: true })
  lineNumber: string;

  @Column({ type: 'enum', enum: UnitOfMeasure, default: UnitOfMeasure.UNIT })
  unitType: UnitOfMeasure;

  @Column('date')
  payDate: Date; // תאריך התשלום

  @Column({ type: 'varchar', length: 10, nullable: true })
  bankNumber: string; // מספר הבנק

  @Column({ type: 'varchar', length: 10, nullable: true })
  branchNumber: string; // מספר הסניף

  @Column({ type: 'varchar', length: 15, nullable: true })
  accountNumber: string; // מספר חשבון

  @Column({ type: 'varchar', length: 10, nullable: true })
  checkNumber: string; // מספר המחאה

  @Column({ type: 'date', nullable: true })
  paymentCheckDate: Date; // תאריך הפירעון של הצ'ק

  @Column({ type: 'enum', enum: CardCompany, nullable: true })
  cardCompany: CardCompany;

  @Column({ type: 'varchar', length: 4, nullable: true })
  card4Number: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  creditCardName: string; // שם הכרטיס הסולק

  @Column({ type: 'enum', enum: CreditTransactionType, nullable: true })
  creditTransType: CreditTransactionType; // סוג עסקת האשראי

  @Column({ type: 'varchar', length: 3, nullable: true })
  creditPayNumber: string;



  /// *********** For inventory *********** ///

  @Column({ type: 'varchar', nullable: true })
  manufacturerName: string;

  @Column({ type: 'varchar', nullable: true })
  productSerialNumber: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  internalNumber: string; // מק"ט פנימי



  /// *********** Joutnal entries *********** ///

  @Column({ type: 'varchar', nullable: true })
  journalEntryMainId: string;
  
}
