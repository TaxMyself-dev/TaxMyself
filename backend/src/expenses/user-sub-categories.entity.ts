import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { DefaultCategory } from './default-categories.entity';
import { User } from '../users/user.entity';
import { UserCategory } from './user-categories.entity';

@Entity()
export class UserSubCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  firebaseId: string;

  @Column()
  subCategoryName: string;

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

  @ManyToOne(() => UserCategory, category => category.userSubCategories, { onDelete: 'CASCADE' })
  category: UserCategory;

  @ManyToOne(() => User, user => user.userSubCategories, { onDelete: 'CASCADE' })
  user: User;
}