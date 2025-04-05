import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, BeforeInsert } from 'typeorm';
import { Currency, DocumentType } from 'src/enum';


@Entity()
export class Documents {

  @PrimaryGeneratedColumn()
  id: number;


  // General document info
  // ******************************************************************************************************************************************************** //

  // docDate
  // docDescription
  // +
  // docVatRate  (by default 18%)
  // currency

  // ******************************************************************************************************************************************************** //



  // Recipient Details
  // ******************************************************************************************************************************************************** //

  // recipientName
  // recipientId
  // recipientEmail
  // recipientPhone
  // +
  // recipientStreet
  // recipientHomeNumber
  // recipientCity
  // recipientPostalCode
  // recipientState
  // recipientStateCode

  // ******************************************************************************************************************************************************** //



  // RECEIPT + TAX_INVOICE_RECEIPT
  // ******************************************************************************************************************************************************** //

  // lineDesc     -----     unitAmount     -----     lineCost     -----     vatOption (include/none-include/without)     -----     paymentMethod    -----
  // +
  // lineDiscount
  // +
  // :: paymentMethod ::
  // Transfer -     bankNumber, branchNumber, accountNumber
  // Check    -     bankNumber, branchNumber, accountNumber, checkNumber, paymentCheckDate
  // Credit   -     cardCompany, card4Number, creditTransType, creditPayNumber 
  // App
  // Cash
  // +
  // ניכוי במקור (עבור מסמך)

  // ******************************************************************************************************************************************************** //



  // TRANSACTION_INVOICE + TAX_INVOICE
  // ******************************************************************************************************************************************************** //

  // lineDesc     -----     unitAmount     -----     lineCost     -----     vatOption (include/none-include/without)     -----     paymentMethod    -----
  // +
  // lineDiscount

  // ******************************************************************************************************************************************************** //



  // CREDIT_INVOICE
  // ******************************************************************************************************************************************************** //

  // lineDesc     -----     unitAmount     -----     lineCost     -----     vatOption (include/none-include/without)     -----     paymentMethod    -----

  // ******************************************************************************************************************************************************** //


  // Another fields to save
  // ******************************************************************************************************************************************************** //

  // docType
  // generalDocIndex
  // docNumber
  // issueDate
  // issueHour
  // isCancelled
  // transType = 3
  // branchCode = null
  // operationPerformer = null



  /// *********** Document Issuer Details *********** ///

  @Column()
  issuerbusinessNumber: string;



  // /// *********** Document Recipient Details *********** ///

  @Column()
  recipientName: string;

  @Column({ nullable: true })
  recipientId: string;

  @Column({ nullable: true })
  recipientStreet: string;

  @Column({ nullable: true })
  recipientHomeNumber: string;

  @Column({ nullable: true })
  recipientCity: string;

  @Column({ nullable: true })
  recipientPostalCode: string;

  @Column({ nullable: true })
  recipientState: string;

  @Column({ nullable: true })
  recipientStateCode: string;

  @Column({ nullable: true })
  recipientPhone: string;

  @Column({ nullable: true })
  recipientEmail: string;



  // /// *********** Document Details *********** ///

  @Column({ type: 'enum', enum: DocumentType })
  docType: DocumentType;

  @Column({ type: 'varchar', length: 7, nullable: true })
  generalDocIndex: string;

  @Column({ type: 'varchar', length: 17, nullable: true })
  allocationNum: string;

  @Column({ type: 'varchar', nullable: true })
  docDescription: string;

  @Column({ type: 'varchar', length: 20 })
  docNumber: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  docVatRate: number;

  @Column({ type: 'varchar', length: 1 })
  transType: string; // = 3

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amountForeign: number; // סכום המסמך במט"ח

  @Column({ type: 'enum', enum: Currency, default: Currency.ILS })
  currency: Currency;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  sumBefDisBefVat: number; //  סכום המסמך לפני הנחה ולפני מע"מ

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  disSum: number; //  סכום ההנחה במסמך

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  sumAftDisBefVAT: number; // סכום המסמך לאחר הנחה לפני מע"מ

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  vatSum: number; //  סכום המע"מ במסמך

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  sumAftDisWithVAT: number; // סכום המסמך לאחר הנחה כולל מע"מ

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  withholdingTaxAmount: number; // סכום הניכוי במקור

  @Column('date')
  docDate: Date; // תאריך המסמך

  @Column('date')
  issueDate: Date; // תאריך הפקה 

  @Column('date')
  valueDate: Date; // תאריך ערך 

  @Column({ type: 'varchar', length: 4 })
  issueHour: string; // שעת הפקה 

  @Column({ type: 'varchar', length: 15, nullable: true })
  customerKey: string; // מפתח הלקוח אצל המוכר

  @Column({ type: 'varchar', length: 10, nullable: true })
  matchField: string; // שדה התאמה

  @Column({ default: false })
  isCancelled: boolean; // האם המסמך בוטל

  @Column({ type: 'varchar', length: 7, nullable: true })
  branchCode: string; // מספר הסניף בו הופק המסמך

  @Column({ type: 'varchar', length: 9, nullable: true })
  operationPerformer: string; // שם המשתמש של מפיק המסמך



  /// *********** Parent document Details *********** ///

  @Column({ type: 'enum', enum: DocumentType, nullable: true })
  parentDocType: DocumentType;

  @Column({ type: 'varchar', length: 20, nullable: true })
  parentDocNumber: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  parentBranchCode: string; //  מספר הסניף בו הופק המסמך האב
}