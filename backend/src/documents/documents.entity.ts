import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { DocumentType, PaymentMethod } from 'src/enum';


@Entity()
export class Documents {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: DocumentType })
  documentType: DocumentType;

  // פרטי מפיק המסמך (העסק)
  @Column()
  issuerName: string; // שם העסק שהפיק את המסמך

  @Column()
  issuerId: string; // ח.פ / ת.ז של העסק המפיק

  @Column()
  issuerAddress: string; // כתובת העסק

  @Column()
  issuerPhone: string; // טלפון העסק

  @Column()
  issuerEmail: string; // אימייל העסק

  // פרטי מקבל המסמך (הלקוח)
  @Column()
  recipientName: string; // שם הלקוח / מקבל המסמך

  @Column()
  recipientId: string; // ח.פ / ת.ז של הלקוח

  @Column()
  recipientAddress: string; // כתובת הלקוח (אם רלוונטי)

  @Column()
  recipientPhone: string; // טלפון הלקוח (אם רלוונטי)

  @Column()
  recipientEmail: string; // אימייל הלקוח (אם רלוונטי)

  // פרטי העסקה
  @Column({ type: 'decimal', precision: 10, scale: 2 }) 
  amountBeforeTax: number; // סכום לפני מע"מ

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) 
  vatRate: number; // שיעור המע"מ (לחשבונית מס)

  @Column({ type: 'decimal', precision: 10, scale: 2 }) 
  vatAmount: number; // סכום המע"מ

  @Column({ type: 'decimal', precision: 10, scale: 2 }) 
  totalAmount: number; // סכום כולל (כולל מע"מ)

  @Column()
  paymentDescription: string; // מהות העסקה / השירות

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod; // אמצעי תשלום

  @Column({ type: 'date' })
  documentDate: Date; // תאריך המסמך (כפי שמופיע עליו)

  @CreateDateColumn()
  issueDate: Date; // תאריך הפקה (נוצר אוטומטית)

  @Column({ nullable: true })
  referenceNumber: string; // מספר מסמך קשור (למשל מספר חשבונית בקבלה)

  @Column({ nullable: true })
  notes: string; // הערות למסמך (אם יש)

  @Column({ default: false })
  isCancelled: boolean; // האם המסמך בוטל

  @Column({ nullable: true })
  cancellationReason: string; // סיבת הביטול (אם המסמך בוטל)
  
}
