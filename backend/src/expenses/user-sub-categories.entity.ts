import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { DefaultCategory } from './default-categories.entity';
import { User } from '../users/user.entity';

@Entity()
export class UserSubCategory {

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

  @ManyToOne(() => DefaultCategory, category => category.userSubCategories, { onDelete: 'CASCADE' })
  category: DefaultCategory;

  @ManyToOne(() => User, user => user.userSubCategories, { onDelete: 'CASCADE' })
  user: User;
}