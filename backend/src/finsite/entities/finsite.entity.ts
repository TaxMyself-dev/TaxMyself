import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SourceType } from 'src/enum';

@Entity()
export class Finsite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  getTransFid: string;

  @Column()
  accountFid: string;

  @Column()
  paymentId: string;

  @Column()
  accountId: string;

  @Column()
  bank: string;

  @Column()
  companyName: string;

  @Column()
  finsiteId: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0.0 })
  balance: number;

  @Column({
    type: 'enum',
    enum: SourceType,
    enumName: 'SourceType',
    default: SourceType.CREDIT_CARD,
  })
  paymentMethodType: SourceType;
}
