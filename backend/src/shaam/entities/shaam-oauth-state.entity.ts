import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamProduct } from './shaam.enums';
import { Business } from '../../business/business.entity';

@Entity('shaam_oauth_state')
@Index('ux_shaam_oauth_state_hash', ['stateHash'], { unique: true })
@Index('ix_shaam_oauth_state_expiry', ['expiresAt'])
export class ShaamOauthState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'state_hash', type: 'char', length: 64 })
  stateHash: string;

  @Column({ name: 'business_id', type: 'int' })
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_shaam_oauth_state_business' })
  business: Business;

  @Column({ name: 'actor_firebase_id', type: 'varchar', length: 255 })
  actorFirebaseId: string;

  @Column({ type: 'enum', enum: ShaamProduct, enumName: 'ShaamProduct' })
  product: ShaamProduct;

  @Column({ type: 'enum', enum: ShaamEnvironment, enumName: 'ShaamEnvironment' })
  environment: ShaamEnvironment;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true, default: null })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
