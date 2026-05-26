import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('user_transaction_cache_state')
@Index('UQ_cache_state_user', ['userId'], { unique: true })
export class UserTransactionCacheState {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'timestamp' })
  lastBuiltAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
