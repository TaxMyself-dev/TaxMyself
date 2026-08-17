import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum DelegationStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

/**
 * Permission scopes a delegation row can carry. DOCUMENTS_READ/WRITE gate
 * document-side impersonated requests (FirebaseAuthGuard). EXPENSES_APPROVE
 * is granted automatically on every delegation-creation path, regardless of
 * what the client chose for the others — approval authority over pending
 * expenses is not a client-configurable permission, see
 * ReportReviewService.previewCheck's client-side suppression, which assumes
 * the delegated accountant can always act on the review queue.
 */
export enum DelegationScope {
  DOCUMENTS_READ = 'DOCUMENTS_READ',
  DOCUMENTS_WRITE = 'DOCUMENTS_WRITE',
  EXPENSES_APPROVE = 'EXPENSES_APPROVE',
}

@Entity()
@Index('ux_delegation_agent_external', ['agentId', 'externalCustomerId'], { unique: true })
@Index('ux_delegation_agent_user', ['agentId', 'userId'], { unique: true })
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
  scopes: DelegationScope[];

}