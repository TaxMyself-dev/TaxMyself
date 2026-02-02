import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column('boolean')
  isExpense: boolean;

}