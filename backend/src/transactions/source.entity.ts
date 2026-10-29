import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Unique } from 'typeorm';
import { Bill } from './bill.entity';
import { SourceType } from 'src/enum';


// Identity is stored once here; sync/cache rows reference this permanent source.
export type ConnectionRole = 'primary' | 'spouse';

@Entity()
@Unique('UQ_source_user_type_name_role', ['userId', 'sourceType', 'sourceName', 'connectionRole'])
export class Source {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  sourceName: string;

  @Column({ type: 'enum', enum: ['primary', 'spouse'], default: 'primary' })
  connectionRole: ConnectionRole;

  @Column({
    type: 'enum',
    enum: SourceType,
    enumName: 'SourceType',
    nullable: false,
  })
  sourceType: SourceType;

  /**
   * Card sources only (always NULL for bank accounts).
   *   true  — Direct/Debit card (Feezback returns NO balances for it). Its
   *           card-feed transactions are intentionally NOT imported — they
   *           arrive through the checking-account (bank) feed instead.
   *   false — Credit card (Feezback returns balances). Imported normally.
   *   NULL  — not yet determined (row predates the isDirect column, or the
   *           card hasn't been inspected with withBalances=true yet).
   * Detection rule (Open Banking standard, confirmed by Feezback): credit
   * cards always return balances; direct cards never do. The value is only
   * ever written from a SUCCESSFUL cards+balances fetch — never guessed.
   */
  @Column({ type: 'boolean', nullable: true, default: null })
  isDirect: boolean | null;

  @ManyToOne(() => Bill, bill => bill.sources)
  bill: Bill;

}