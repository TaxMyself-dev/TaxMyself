import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';
import { DefaultSubCategory } from './default-sub-categories.entity';

@Entity()
export class DefaultCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @OneToMany(() => DefaultSubCategory, defaultSubCategory => defaultSubCategory.category)
  defaultSubCategories: DefaultSubCategory[];
  
}