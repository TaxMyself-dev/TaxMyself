import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { Category } from './categories.entity';
import { User } from 'src/users/user.entity';

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

  @ManyToOne(() => Category, category => category.defaultSubCategories, { onDelete: 'CASCADE' })
  category: Category;
}