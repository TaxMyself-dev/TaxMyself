import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DocumentType } from 'src/enum';

@Entity()
export class SettingDocuments {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: DocumentType })
  docType: DocumentType;

  @Column({ type: 'int', nullable: true, default: null })
  initialIndex: number | null;

  @Column({ type: 'int', default: 0 })
  currentIndex: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

}