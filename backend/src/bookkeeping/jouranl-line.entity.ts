import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';


@Entity()
export class JournalLine {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  issuerBusinessNumber: string;

  @Column()
  journalEntryId: number;

  @Column()
  lineInEntry: number;

  @Column()
  accountCode: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  credit: number;
}