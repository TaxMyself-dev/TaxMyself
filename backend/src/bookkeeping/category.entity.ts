import { Entity, PrimaryGeneratedColumn, Column, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OwnerType, VisibilityScope, SYSTEM_CHART_OWNER_KEY, RecognitionType, CategoryType } from 'src/enum';

/**
 * קטגוריה — client-facing display group (D1 of the categories redesign).
 * Carries NO accounting law (that lives on booking_account, D1 revised).
 * Replaces default_category + user_category (migrated in Phase 2.2).
 */
// Named explicitly (matching the constraint name 2026-07-12_catalog_migration_schema.sql
// creates in prod) so TypeORM's synchronize computes the same name an unnamed
// decorator would hash-generate — an accidental synchronize run against
// keepintax_prodcopy on 2026-07-12 dropped this exact constraint (name
// mismatch) and never recreated it; see schema-drift.md Gap 7.
@Entity('category')
@Unique('uq_category_owner_name_type', ['chartOwnerKey', 'name', 'type'])
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;

  /** UI hint only — pre-fills the recognition choice when a client adds a new
   *  sub_category under this category (D9/6.2's add-category flow). NOT the
   *  accounting law (booking_account.recognitionType) and NOT `isPrivate`
   *  (sub_category-only concept per D5). NULL = no suggested default. */
  @Column({ type: 'enum', enum: RecognitionType, nullable: true, default: null })
  defaultRecognitionType: RecognitionType | null;

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
