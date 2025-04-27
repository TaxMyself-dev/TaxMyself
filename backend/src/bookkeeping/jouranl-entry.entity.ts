import { JournalReferenceType } from 'src/enum';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class JournalEntry {

  @PrimaryGeneratedColumn()
  id: number; // Unique ID for the journal entry

  @Column()
  businessNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: JournalReferenceType, nullable: true })
  referenceType: JournalReferenceType;

  @Column()
  referenceId: number; // The ID of the invoice/receipt/expense etc

  @CreateDateColumn()
  createdAt: Date; 

}
