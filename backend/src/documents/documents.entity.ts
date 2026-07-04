import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, BeforeInsert } from 'typeorm';
import { Currency, DocumentStatusType, DocumentType } from 'src/enum';


@Entity()
export class Documents {

  @PrimaryGeneratedColumn()
  id: number;

  /// *********** Document Issuer Details *********** ///

  @Column()
  issuerBusinessNumber: string;

  
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

  @Column({ type: 'varchar', length: 26, nullable: true })
  allocationNum: string;

  @Column({ type: 'varchar', nullable: true })
  docDescription: string;

  @Column({ type: 'varchar', nullable: true })
  docSubtitle: string; // כותרת משנה

  @Column({ type: 'varchar', length: 20 })
  docNumber: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  docVatRate: number;

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

  @Column({ type: 'enum', enum: DocumentStatusType })
  docStatus: DocumentStatusType;

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  file: string; // Firebase storage path for original document (מקור)

  @Column({ type: 'varchar', length: 255, nullable: true })
  copyFile: string; // Firebase storage path for certified copy (העתק נאמן למקור)

  /**
   * Per-business running number of the JournalEntry created for this document.
   * Matches JournalEntry.entryNumber. NULL for legacy documents created before
   * this field was added, or for document types that don't generate a journal entry
   * (e.g. TRANSACTION_INVOICE, PENDING_ALLOCATION docs before finalization).
   */
  @Column({ type: 'int', nullable: true, default: null })
  journalEntryNumber: number | null;

  /**
   * Global PK of the JournalEntry row (journal_entry.id).
   * Allows a direct FK join: JOIN journal_entry je ON je.id = d.journalEntryId.
   * NULL under the same conditions as journalEntryNumber above.
   */
  @Column({ type: 'int', nullable: true, default: null })
  journalEntryId: number | null;
}