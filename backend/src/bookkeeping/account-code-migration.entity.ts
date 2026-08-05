import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn } from 'typeorm';

/**
 * One-time old→new account code map driving Phase 1.4's renumbering UPDATEs
 * on journal_line.accountCode / journal_entry.counterAccountCode (D2). Not
 * part of the four-table core model — a migration artifact, kept after
 * cutover for audit/traceability rather than dropped.
 */
// Named explicitly to match 2026-07-10_chart_renumber.sql's
// uq_account_code_migration_oldCode — caught by the same audit as
// schema-drift.md Gap 7: this was unnamed and got silently renamed to a
// TypeORM hash name by the 2026-07-12 accidental synchronize run
// (structurally survived, unlike the other 5, but still worth pinning).
@Entity('account_code_migration')
@Unique('uq_account_code_migration_oldCode', ['oldCode'])
export class AccountCodeMigration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  oldCode: string;

  @Column()
  newCode: string;

  /** Which legacy column this old code came from — 'accountCode' (parent
   *  chart accounts) or 'subAccountCode' (dev-only sub-ledger codes, never
   *  present in production — schema-drift.md Gap 1). */
  @Column({ type: 'enum', enum: ['accountCode', 'subAccountCode'] })
  source: 'accountCode' | 'subAccountCode';

  @CreateDateColumn()
  createdAt: Date;
}
