import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';

@Entity()
export class DefaultCategory {

  @PrimaryGeneratedColumn()
  id: number;

  // @Column()
  // category: string;

  @Column()
  categoryName: string;

  // @Column({ default: false })
  // isDefault: boolean;

  // @Column({ nullable: true })
  // firebaseId: string;

  @OneToMany(() => DefaultSubCategory, defaultSubCategory => defaultSubCategory.category)
  defaultSubCategories: DefaultSubCategory[];

  // @OneToMany(() => UserSubCategory, userSubCategory => userSubCategory.category)
  // userSubCategories: UserSubCategory[];
  
}