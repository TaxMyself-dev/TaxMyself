import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';

@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  category: string;

  // @Column({ default: false })
  // isDefault: boolean;

  // @Column({ nullable: true })
  // firebaseId: string;

  // @OneToMany(() => DefaultSubCategory, defaultSubCategory => defaultSubCategory.category)
  // defaultSubCategories: DefaultSubCategory[];

  // @OneToMany(() => UserSubCategory, userSubCategory => userSubCategory.category)
  // userSubCategories: UserSubCategory[];
  
}