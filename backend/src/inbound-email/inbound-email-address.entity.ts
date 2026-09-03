import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('inbound_email_addresses')
@Index('ux_inbound_email_address_business', ['firebaseId', 'businessNumber'], {
  unique: true,
})
@Index('ux_inbound_email_address_local_part', ['localPart'], { unique: true })
export class InboundEmailAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({ name: 'business_number', type: 'varchar', length: 255 })
  businessNumber: string;

  /** Opaque mailbox identifier. Never derive it from a business number. */
  @Column({ name: 'local_part', type: 'varchar', length: 64 })
  localPart: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
