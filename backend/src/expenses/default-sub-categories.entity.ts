import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { Category } from './categories.entity';

@Entity()
export class DefaultSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subCategory: string;

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

  @ManyToOne(() => Category, category => category.defaultSubCategories, { onDelete: 'CASCADE' })
  category: Category;

}