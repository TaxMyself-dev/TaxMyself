import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
export interface ConsentEvidence {
  id: string;
  status: string;
  validUntil: string | null;
}
export interface IdentityEvidence {
  consents: ConsentEvidence[];
  checkedAt: string | null;
  error: string | null;
}
export type ProviderEvidence = Record<'primary' | 'spouse', IdentityEvidence>;

/** Operational evidence only; no credentials or financial data. */
@Entity('feezback_lifecycle')
@Index('ix_feezback_lifecycle_due', ['nextCheckAt'])
export class FeezbackLifecycle {
  @PrimaryColumn({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;
  @Column({ type: 'json', nullable: true }) evidence: ProviderEvidence | null;
  @Column({
    name: 'entitlement_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  entitlementKey: string | null;
  @Column({ name: 'next_check_at', type: 'datetime' }) nextCheckAt: Date;
  @Column({ type: 'int', default: 0 }) generation: number;
  @Column({ name: 'lease_token', type: 'varchar', length: 36, nullable: true })
  leaseToken: string | null;
  @Column({ name: 'lease_until', type: 'datetime', nullable: true })
  leaseUntil: Date | null;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ name: 'disconnect_requested', default: false })
  disconnectRequested: boolean;
  @Column({ name: 'last_action', type: 'varchar', length: 40, nullable: true })
  lastAction: string | null;
  @Column({ name: 'last_error', type: 'varchar', length: 80, nullable: true })
  lastError: string | null;
  @Column({
    name: 'requested_by',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  requestedBy: string | null;
  @Column({ name: 'requested_at', type: 'datetime', nullable: true })
  requestedAt: Date | null;
}
