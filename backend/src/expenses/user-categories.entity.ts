import { Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity()
export class UserCategory {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  categoryName: string;

  @Column({ nullable: true })
  firebaseId: string;
  
}