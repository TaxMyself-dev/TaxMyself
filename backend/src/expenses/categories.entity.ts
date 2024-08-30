import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';

import { DefaultSubCategory } from './default-sub-categories.entity copy';
import { UserSubCategory } from './user-sub-categories.entity';

@Entity()
export class Category {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  firebaseId: string;

  @OneToMany(() => DefaultSubCategory, defaultSubCategory => defaultSubCategory.category)
  defaultSubCategories: DefaultSubCategory[];

  @OneToMany(() => UserSubCategory, userSubCategory => userSubCategory.category)
  userSubCategories: UserSubCategory[];
}

// @Entity()
// export class DefaultCategory {

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

// }





