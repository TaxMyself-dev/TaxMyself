import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { DefaultCategory } from './default-categories.entity';

@Entity()
export class DefaultSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

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

  @ManyToOne(() => DefaultCategory, category => category.defaultSubCategories, { onDelete: 'CASCADE' })
  category: DefaultCategory;

}