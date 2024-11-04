import { Entity, PrimaryGeneratedColumn, Column, OneToMany} from 'typeorm';

@Entity()
export class DefaultCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;
  
}