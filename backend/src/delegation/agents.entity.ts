import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index} from 'typeorm';

export enum AgentStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity()
@Index('ux_agent_api_key_hash', ['apiKeyHash'], { unique: true })
export class Agents {
  
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.ACTIVE,
  })
  status: AgentStatus;

  @Column({ type: 'varchar', unique: true })
  apiKeyHash: string;

  @Column({ type: 'varchar' })
  encryptedHmacSecret: string;

  @CreateDateColumn()
  createdAt: Date;
}

