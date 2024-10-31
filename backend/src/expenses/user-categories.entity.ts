import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne} from 'typeorm';
import { UserSubCategory } from './user-sub-categories.entity';
import { User } from 'src/users/user.entity';

@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  // @Column({ default: false })
  // isDefault: boolean;

  @Column({ nullable: true })
  firebaseId: string;

  @OneToMany(() => UserSubCategory, userSubCategory => userSubCategory.category)
  userSubCategories: UserSubCategory[];
  
}