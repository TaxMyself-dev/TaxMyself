import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_method')
@Index('ix_payment_method_firebase', ['firebaseId'])
export class PaymentMethod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /**
   * CardCom merchant-managed token.
   * TODO: Encrypt this field at rest before going to production.
   *   Implement an AES-256-GCM (or equivalent) encryption utility and
   *   encrypt/decrypt the value in the billing service layer.
   *   NEVER expose cardcom_token to the frontend or include it in API responses.
   */
  @Column({ name: 'cardcom_token', type: 'varchar', length: 512 })
  cardcomToken: string;

  @Column({ name: 'last4', type: 'varchar', length: 4, nullable: true, default: null })
  last4: string | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 50, nullable: true, default: null })
  cardBrand: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
