import { Entity, PrimaryGeneratedColumn, Column, ManyToOne} from 'typeorm';
import { Category } from './categories.entity';
import { User } from 'src/users/user.entity';

@Entity()
export class UserSubCategory {

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

  @ManyToOne(() => Category, category => category.userSubCategories, { onDelete: 'CASCADE' })
  category: Category;

  @ManyToOne(() => User, user => user.userSubCategories, { onDelete: 'CASCADE' })
  user: User;
}


// @Entity()
// export class UserCategory {

//     @PrimaryGeneratedColumn()
//     id: number;

//     @Column()
//     subCategory: string;

//     @Column()
//     category: string;

//     @Column('decimal')
//     taxPercent: number;
  
//     @Column('decimal')
//     vatPercent: number;

//     @Column('decimal')
//     reductionPercent: number;

//     @Column('boolean')
//     isEquipment: boolean;

//     @Column('boolean')
//     isRecognized: boolean;

//     @Column()
//     userId: string;

// }