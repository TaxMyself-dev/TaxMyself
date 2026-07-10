import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OwnerType, VisibilityScope, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

/**
 * חתך — the P&L grouping a booking_account rolls up into (D1/D3 of the
 * categories redesign). Replaces the string `booking_account.pnlCategory`
 * namespace; `pnlCategory` remains on BookingAccount temporarily (dropped
 * Phase 7) so existing report code keeps working until Phase 4.4.
 */
@Entity('accounting_section')
@Unique(['chartOwnerKey', 'code'])
export class AccountingSection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: OwnerType, default: OwnerType.SYSTEM })
  ownerType: OwnerType;

  @Column({ default: SYSTEM_CHART_OWNER_KEY })
  chartOwnerKey: string;

  /** Agent firebaseId when ownerType=ACCOUNTANT, or creator when accountant-created for a client. */
  @Column({ nullable: true, default: null })
  accountantId: string | null;

  /** Client firebaseId when ownerType=CLIENT. */
  @Column({ nullable: true, default: null })
  userId: string | null;

  @Column({ nullable: true, default: null })
  businessNumber: string | null;

  @Column({ type: 'enum', enum: VisibilityScope, nullable: true, default: null })
  visibilityScope: VisibilityScope | null;

  @Column({ type: 'int', nullable: true, default: null })
  displayOrder: number | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
