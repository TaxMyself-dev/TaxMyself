import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class DefaultBookingAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'; 

}
