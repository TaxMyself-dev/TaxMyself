import { ExpenseNecessity } from 'src/enum';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class UserSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column()
  subCategoryName: string;

  @Column()
  categoryName: string;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('decimal')
  reductionPercent: number;

  @Column('boolean')
  isEquipment: boolean;

  @Column('boolean')
  isRecognized: boolean;

  @Column('boolean')
  isExpense: boolean;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

}