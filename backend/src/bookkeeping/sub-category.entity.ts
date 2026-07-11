import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OwnerType, VisibilityScope, SYSTEM_CHART_OWNER_KEY, ExpenseNecessity, ExpenseReportScope, ApprovalStatus } from 'src/enum';
import { Category } from './category.entity';
import { BookingAccount } from './account.entity';

/**
 * תת-קטגוריה — client-language label for an expense type; a THIN pointer at
 * a booking_account (D1 revised — carries no accounting fields of its own,
 * the card carries the full accounting law). Replaces default_sub_category +
 * user_sub_category (migrated in Phase 2.2).
 */
@Entity('sub_category')
@Unique(['chartOwnerKey', 'categoryId', 'name'])
export class SubCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  categoryId: number;

  @Column()
  name: string;

  /** No card at all — never journaled, excluded from business reports (D5).
   *  Always implies accountId IS NULL. */
  @Column({ default: false })
  isPrivate: boolean;

  /** Thin pointer at the card carrying the FULL accounting law (D1 revised).
   *  NULL when isPrivate, or when approvalStatus = MISSING_ACCOUNTING_MAPPING. */
  @ManyToOne(() => BookingAccount, { nullable: true })
  @JoinColumn({ name: 'accountId' })
  account: BookingAccount | null;

  @Column({ type: 'int', nullable: true, default: null })
  accountId: number | null;

  @Column({ type: 'enum', enum: ExpenseNecessity, default: ExpenseNecessity.IMPORTANT })
  necessity: ExpenseNecessity;

  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

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

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.APPROVED })
  approvalStatus: ApprovalStatus;

  @Column({ nullable: true, default: null })
  approvedByUserId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  approvedAt: Date | null;

  @Column({ nullable: true, default: null })
  rejectedByUserId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  rejectedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  rejectionReason: string | null;

  /** true = curated/seed origin (Phase 2.2 migration, future flat seeder);
   *  false = created later via CRUD. */
  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, default: null })
  createdByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
