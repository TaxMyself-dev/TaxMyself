import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum DelegationStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity()
@Index('ux_delegation_agent_external', ['agentId', 'externalCustomerId'], { unique: true })
export class Delegation {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string; // ID of the user (Firebase UID)

  @Column({ type: 'varchar' })
  agentId: string; // ID of the agent (numeric ID as string)

  @Column({ type: 'varchar', nullable: true })
  externalCustomerId: string | null; // External customer ID from agent system

  @Column({
    type: 'enum',
    enum: DelegationStatus,
    default: DelegationStatus.ACTIVE,
  })
  status: DelegationStatus;

  @Column({
    type: 'simple-array',
    nullable: true,
  })
  scopes: string[]; // Array of permission scopes (e.g., DOCUMENTS_READ, DOCUMENTS_WRITE)

}