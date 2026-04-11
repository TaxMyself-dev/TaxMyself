import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ModuleName, PayStatus } from '../enum';

@Entity()
export class UserModuleSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firebaseId: string;

  @Column({ type: 'enum', enum: ModuleName, enumName: 'ModuleName' })
  moduleName: ModuleName;

  @Column({ type: 'date' })
  trialStartDate: Date;

  @Column({ type: 'date' })
  trialEndDate: Date;

  @Column({ type: 'enum', enum: PayStatus, enumName: 'PayStatus' })
  payStatus: PayStatus;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  monthlyPriceNis: number;

  @Column({ type: 'date', nullable: true, default: null })
  createdAt: Date;
}
