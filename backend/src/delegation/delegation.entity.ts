import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Delegation {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  ownerId: string; // ID of the user

  @Column({ type: 'varchar' })
  delegateId: string; // ID of the accountant or manager

}