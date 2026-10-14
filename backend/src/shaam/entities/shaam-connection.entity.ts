import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamConnectionStatus, ShaamProduct } from './shaam.enums';
import { Business } from '../../business/business.entity';

@Entity('shaam_connection')
@Index('ux_shaam_connection_business_product_env', ['businessId', 'product', 'environment'], { unique: true })
@Index('ix_shaam_connection_status_expiry', ['status', 'expiresAt'])
export class ShaamConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'business_id', type: 'int' })
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_shaam_connection_business' })
  business: Business;

  @Column({ type: 'enum', enum: ShaamProduct, enumName: 'ShaamProduct' })
  product: ShaamProduct;

  @Column({ type: 'enum', enum: ShaamEnvironment, enumName: 'ShaamEnvironment' })
  environment: ShaamEnvironment;

  @Column({ name: 'access_token', type: 'text', nullable: true, default: null })
  accessToken: string | null;

  @Column({ name: 'refresh_token', type: 'text', nullable: true, default: null })
  refreshToken: string | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true, default: null })
  expiresAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  scopes: string | null;

  @Column({ type: 'enum', enum: ShaamConnectionStatus, enumName: 'ShaamConnectionStatus', default: ShaamConnectionStatus.ACTIVE })
  status: ShaamConnectionStatus;

  @Column({ name: 'connected_by_firebase_id', type: 'varchar', length: 255 })
  connectedByFirebaseId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
