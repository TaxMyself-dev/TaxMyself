import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DocumentType } from 'src/enum';

@Entity()
@Index('uq_setting_documents_user_business_doctype', ['userId', 'issuerBusinessNumber', 'docType'], { unique: true })
export class SettingDocuments {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  issuerBusinessNumber: string;

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