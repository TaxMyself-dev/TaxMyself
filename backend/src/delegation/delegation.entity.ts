import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Delegation {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string; // ID of the user

  @Column({ type: 'varchar' })
  agentId: string; // ID of the accountant or agent

}