import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Persistent cache of foreign-exchange rates to ILS.
 *
 * One row per (date, currency). On a cache miss, FxRateService fetches from
 * the Bank of Israel public API and INSERTs the row. Subsequent lookups for
 * the same date+currency are served from the DB.
 *
 * `rateToIls` is a multiplier — `ilsAmount = originalAmount * rateToIls`.
 */
@Entity('fx_rate')
@Index('UQ_fx_rate_date_currency', ['date', 'currency'], { unique: true })
export class FxRate {
  @PrimaryGeneratedColumn()
  id: number;

  /** The date the rate applies to (the transaction date for tax purposes). */
  @Column('date')
  date: Date;

  /** ISO-4217 code, uppercase. e.g. "USD", "EUR", "GBP". */
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  /** Multiplier from `currency` to ILS. */
  @Column({ type: 'decimal', precision: 12, scale: 6 })
  rateToIls: number;

  /**
   * The date BOI actually published the rate for. When the user's transaction
   * falls on a weekend/holiday and we used the previous business day's rate,
   * this records which day was used. Usually equal to `date`.
   */
  @Column({ type: 'date', nullable: true, default: null })
  effectiveDate: Date | null;

  @CreateDateColumn()
  fetchedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
