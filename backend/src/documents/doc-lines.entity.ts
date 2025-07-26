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

  @Column({ type: 'varchar', length: 4, nullable: true })
  lineNumber: string;

  @Column({ type: 'varchar', length: 1 })
  transType: string; // = 3

  @Column({ type: 'varchar', length: 20, nullable: true })
  internalNumber: string; // מק"ט פנימי

  @Column()
  description: string;

  @Column({ type: 'varchar', nullable: true })
  manufacturerName: string;

  @Column({ type: 'varchar', nullable: true })
  productSerialNumber: string;

  @Column({ type: 'enum', enum: UnitOfMeasure, default: UnitOfMeasure.UNIT })
  unitType: UnitOfMeasure;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  unitQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  sumBefVatPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  disBefVatPerLine: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  sumAftDisBefVatPerLine: number;

  @Column({ type: 'enum', enum: VatOptions, default: VatOptions.INCLUDE })
  vatOpts: VatOptions;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  vatRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  vatPerLine: number;

  /// *********** Joutnal entries *********** ///

  @Column({ type: 'varchar', nullable: true })
  journalEntryMainId: string;
  
}
