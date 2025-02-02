import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn} from 'typeorm';

@Entity()
export class SettingDocuments {
  
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar'})
    userId: string;
  
    @Column({ type: 'varchar', length: 50 })
    documentType: string;
  
    @Column({ type: 'int' })
    initialIndex: number;
  
    @Column({ type: 'int', default: 0 })
    currentIndex: number;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;

  }