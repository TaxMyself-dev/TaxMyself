import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Unique } from 'typeorm';
import { Bill } from './bill.entity';
import { SourceType } from 'src/enum';


// Named explicitly — found unnamed during the schema-drift.md Gap 7 audit
// (2026-07-12). Name confirmed against a fresh re-import of
// _prod_dump/keepintax-prod.sql (ground truth): production's real
// constraint name is IDX_source_userId_sourceName, NOT a hash TypeORM
// would compute for an unnamed decorator — same drop-risk pattern as the
// other 5 tables in Gap 7.
@Entity()
@Unique('IDX_source_userId_sourceName', ['userId', 'sourceName'])
export class Source {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  sourceName: string;

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