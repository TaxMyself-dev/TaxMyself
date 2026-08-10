# Form 6111 code integration — read-only audit

Date: 2026-08-10
Scope: read-only — no code, schema, or data changed. Ran against `keepintax-dev`
(34.165.27.179) directly with `SELECT`/`SHOW` only; `keepintax_prodcopy` was not touched.

Purpose: gather the current state of `booking_account`/`accounting_section` and the
"כרטיסים" accountant Excel export before deciding how to integrate Form 6111 field
codes into the chart of accounts.

## 1. `booking_account` entity — `backend/src/bookkeeping/account.entity.ts`

```ts
@Entity('booking_account')
@Unique('uq_booking_account_owner_code', ['chartOwnerKey', 'code'])
export class BookingAccount {
  @PrimaryGeneratedColumn() id: number;
  @Column() code: string;
  @Column() name: string;
  @Column() type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  @Column({ nullable: true }) pnlCategory: string | null;        // DEAD since Phase 4.4, kept for rollback
  @Column({ nullable: true }) displayOrder: number | null;       // TEMPORARY, dropped Phase 7
  @ManyToOne(() => AccountingSection, { nullable: true })
  @JoinColumn({ name: 'sectionId' }) section: AccountingSection | null;
  @Column({ type: 'int', nullable: true, default: null }) sectionId: number | null;
  @Column({ nullable: true, default: null }) code6111: string | null;  // Form 6111 field — NULL = not sourced yet
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null }) vatPercent: number | null;
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null }) taxPercent: number | null;
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: null }) reductionPercent: number | null;
  @Column({ type: 'boolean', nullable: true, default: null }) isEquipment: boolean | null;
  @Column({ type: 'enum', enum: RecognitionType, nullable: true, default: null }) recognitionType: RecognitionType | null;
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL }) reportScope: ExpenseReportScope;
  @Column({ type: 'enum', enum: OwnerType, default: OwnerType.SYSTEM }) ownerType: OwnerType;
  @Column({ default: SYSTEM_CHART_OWNER_KEY }) chartOwnerKey: string;
  @Column({ nullable: true, default: null }) accountantId: string | null;
  @Column({ nullable: true, default: null }) userId: string | null;
  @Column({ nullable: true, default: null }) businessNumber: string | null;
  @Column({ type: 'enum', enum: VisibilityScope, nullable: true, default: null }) visibilityScope: VisibilityScope | null;
  @Column({ default: true }) isActive: boolean;
}
```

**No `createdAt`/`updatedAt`** — neither the entity nor the live table has timestamp
columns on `booking_account` (confirmed by `SHOW CREATE TABLE`, §3). `AccountingSection`
does have them; `BookingAccount` doesn't.

## 2. `accounting_section` entity — `backend/src/bookkeeping/accounting-section.entity.ts`

```ts
@Entity('accounting_section')
@Unique('uq_accounting_section_owner_code', ['chartOwnerKey', 'code'])
export class AccountingSection {
  @PrimaryGeneratedColumn() id: number;
  @Column() code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: OwnerType, default: OwnerType.SYSTEM }) ownerType: OwnerType;
  @Column({ default: SYSTEM_CHART_OWNER_KEY }) chartOwnerKey: string;
  @Column({ nullable: true, default: null }) accountantId: string | null;
  @Column({ nullable: true, default: null }) userId: string | null;
  @Column({ nullable: true, default: null }) businessNumber: string | null;
  @Column({ type: 'enum', enum: VisibilityScope, nullable: true, default: null }) visibilityScope: VisibilityScope | null;
  @Column({ type: 'int', nullable: true, default: null }) displayOrder: number | null;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

## 3. Live DB results — `keepintax-dev`

**Query 1** — all 70 accounts, ordered by code. Full result set (code / name / reportScope
/ recognitionType / sectionName / ownerType):

| code | name | reportScope | recognitionType | sectionName | ownerType |
|---|---|---|---|---|---|
| 1000 | חשבון מעבר | pnl | NULL | NULL | NULL |
| 1100 | בנק | pnl | NULL | NULL | NULL |
| 1110 | מזומן | pnl | NULL | NULL | NULL |
| 1120 | כרטיס אשראי / סליקה | pnl | NULL | NULL | NULL |
| 1200 | לקוחות כלליים | pnl | NULL | NULL | NULL |
| 2000 | ספקים כלליים | pnl | NULL | NULL | NULL |
| 2100 | כרטיסי אשראי לתשלום | pnl | NULL | NULL | NULL |
| 2400 | מע"מ עסקאות | pnl | NULL | NULL | NULL |
| 2410 | מע"מ תשומות | pnl | NULL | NULL | NULL |
| 40000 | הכנסות | pnl | NULL | הכנסות | SYSTEM |
| 40010 | הכנסות פטורות | pnl | NULL | הכנסות פטורות | SYSTEM |
| 60000 | הוצאות לא מוכרות | pnl | NOT_RECOGNIZED | הוצאות בלתי מזוהות | SYSTEM |
| 60010 | ספקים — כללי (הוצאה מוכרת) | pnl | RECOGNIZED | הוצאות בלתי מזוהות | SYSTEM |
| 60100 | הוצאות משרד | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60110 | ארנונה | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60120 | גז | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60130 | ועד בית | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60140 | חשמל | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60150 | מים | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60160 | תחזוקה | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60170 | שכירות משרד | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60180 | שליחויות | pnl | RECOGNIZED | הוצאות משרד | SYSTEM |
| 60200 | רכב ותחבורה | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60210 | ביטוח רכב | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60220 | דלק | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60230 | חניה | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60240 | טיפולים | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60250 | כבישי אגרה | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60260 | מערכות | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60270 | תחבורה ציבורית | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 60300 | תקשורת | pnl | RECOGNIZED | תקשורת | SYSTEM |
| 60310 | אינטרנט | pnl | RECOGNIZED | תקשורת | SYSTEM |
| 60320 | טלפון קווי | pnl | RECOGNIZED | תקשורת | SYSTEM |
| 60330 | פלאפון | pnl | RECOGNIZED | תקשורת | SYSTEM |
| 60400 | תוכנות ושירותי ענן | pnl | RECOGNIZED | תוכנות ושירותי ענן | SYSTEM |
| 60410 | תוכנות | pnl | RECOGNIZED | תוכנות ושירותי ענן | SYSTEM |
| 60500 | שיווק ופרסום | pnl | RECOGNIZED | שיווק ופרסום | SYSTEM |
| 60600 | ייעוץ ושירותים מקצועיים | pnl | RECOGNIZED | ייעוץ ושירותים מקצועיים | SYSTEM |
| 60610 | ייעוץ והשתלמויות | pnl | RECOGNIZED | ייעוץ ושירותים מקצועיים | SYSTEM |
| 60620 | ייעוץ מקצועי | pnl | RECOGNIZED | ייעוץ ושירותים מקצועיים | SYSTEM |
| 60630 | שכר טרחה | pnl | RECOGNIZED | ייעוץ ושירותים מקצועיים | SYSTEM |
| 60700 | הנהלת חשבונות | pnl | RECOGNIZED | הנהלת חשבונות | SYSTEM |
| 60800 | שכר | pnl | RECOGNIZED | שכר | SYSTEM |
| 60810 | הוצאות שכר | pnl | RECOGNIZED | שכר | SYSTEM |
| 60900 | ספרות מקצועית | pnl | RECOGNIZED | ספרות מקצועית | SYSTEM |
| 61000 | כיבוד | pnl | RECOGNIZED | כיבוד | SYSTEM |
| 61010 | מתנות מוכרות | pnl | RECOGNIZED | כיבוד | SYSTEM |
| 61100 | עמלות ודמי כרטיס | pnl | RECOGNIZED | עמלות ודמי כרטיס | SYSTEM |
| 61110 | עמלות ודמי כרטיס (עסק) | pnl | RECOGNIZED | עמלות ודמי כרטיס | SYSTEM |
| 61120 | עמלות ודמי כרטיס (בנק, אשראי ותנועות) | pnl | RECOGNIZED | עמלות ודמי כרטיס | SYSTEM |
| 61200 | הוצאות מימון | pnl | RECOGNIZED | הוצאות מימון | SYSTEM |
| 61210 | ריבית | pnl | RECOGNIZED | הוצאות מימון | SYSTEM |
| 61300 | פחת | pnl | RECOGNIZED | פחת | SYSTEM |
| 61310 | מחשב | pnl | RECOGNIZED | פחת | SYSTEM |
| 61320 | ריהוט | pnl | RECOGNIZED | פחת | SYSTEM |
| 61330 | רכב | pnl | RECOGNIZED | פחת | SYSTEM |
| 61340 | תרומות מוכרות | annual | NOT_APPLICABLE | NULL | NULL |
| 61350 | ביטוח חיים | annual | NOT_APPLICABLE | NULL | NULL |
| 61360 | ביטוח אובדן כושר עבודה | annual | NOT_APPLICABLE | NULL | NULL |
| 61370 | הפקדה לפנסיה | annual | NOT_APPLICABLE | NULL | NULL |
| 61380 | הפקדה לקרן השתלמות | annual | NOT_APPLICABLE | NULL | NULL |
| 61390 | רכישת משרד | pnl | RECOGNIZED | פחת | SYSTEM |
| 80000 | דלק מוכר מלא — מוכר 100%/100% | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 80010 | דלק 50 50 — מוכר 50%/50% | pnl | RECOGNIZED | רכב ותחבורה | SYSTEM |
| 90100 | מקדמות מס הכנסה | technical | NOT_APPLICABLE | NULL | NULL |
| 90200 | גביית מע"מ | technical | NOT_APPLICABLE | NULL | NULL |
| 90300 | מקדמות ביטוח לאומי | technical | NOT_APPLICABLE | NULL | NULL |
| 90400 | מס במקור שנוכה מלקוחות | technical | NOT_APPLICABLE | NULL | NULL |
| 90500 | תנועות פנימיות בין חשבונות | technical | NOT_APPLICABLE | NULL | NULL |
| 90600 | פרעון הלוואות (קרן) | technical | NOT_APPLICABLE | NULL | NULL |

**Query 2** — as literally written (`WHERE code < '10000'`) returned only **1 row**
(`1000`). That's a false result: `code` is `varchar`, so the comparison is lexicographic,
and `'1100' > '10000'` as a string (`'1'`>`'0'` at the second character). Re-ran with
`CAST(code AS UNSIGNED) < 10000` for the correct set:

| code | name | reportScope | sectionId | code6111 |
|---|---|---|---|---|
| 1000 | חשבון מעבר (transfer account) | pnl | NULL | NULL |
| 1100 | בנק (bank) | pnl | NULL | NULL |
| 1110 | מזומן (cash) | pnl | NULL | NULL |
| 1120 | כרטיס אשראי / סליקה (credit card) | pnl | NULL | NULL |
| 1200 | לקוחות כלליים (customers) | pnl | NULL | NULL |
| 2000 | ספקים כלליים (suppliers) | pnl | NULL | NULL |
| 2100 | כרטיסי אשראי לתשלום (credit cards payable) | pnl | NULL | NULL |
| 2400 | מע"מ עסקאות (output VAT) | pnl | NULL | NULL |
| 2410 | מע"מ תשומות (input VAT) | pnl | NULL | NULL |

No `createdAt`/`updatedAt` columns exist on `booking_account`, so these 9 rows can't be
dated against the 2026-07-10 renumbering from the DB alone — see §5 caveat.

**Query 3/4** — `SHOW CREATE TABLE` for both tables matches the entity definitions
exactly (indexes `uq_booking_account_owner_code`/`uq_accounting_section_owner_code`, FK
`sectionId → accounting_section.id`). No schema drift.

```sql
CREATE TABLE `booking_account` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `pnlCategory` varchar(255) DEFAULT NULL,
  `displayOrder` int DEFAULT NULL,
  `sectionId` int DEFAULT NULL,
  `code6111` varchar(255) DEFAULT NULL,
  `ownerType` enum('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey` varchar(255) NOT NULL DEFAULT 'SYSTEM',
  `accountantId` varchar(255) DEFAULT NULL,
  `userId` varchar(255) DEFAULT NULL,
  `businessNumber` varchar(255) DEFAULT NULL,
  `visibilityScope` enum('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT '1',
  `vatPercent` decimal(5,2) DEFAULT NULL,
  `taxPercent` decimal(5,2) DEFAULT NULL,
  `reductionPercent` decimal(5,2) DEFAULT NULL,
  `isEquipment` tinyint DEFAULT NULL,
  `recognitionType` enum('RECOGNIZED','NOT_RECOGNIZED','NOT_APPLICABLE') DEFAULT NULL,
  `reportScope` enum('pnl','annual','technical') NOT NULL DEFAULT 'pnl',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_booking_account_owner_code` (`chartOwnerKey`,`code`),
  KEY `FK_cdf8f6c41ea30c8ca4e9afaf0c6` (`sectionId`),
  CONSTRAINT `FK_cdf8f6c41ea30c8ca4e9afaf0c6` FOREIGN KEY (`sectionId`) REFERENCES `accounting_section` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1601 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

CREATE TABLE `accounting_section` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `ownerType` enum('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey` varchar(255) NOT NULL DEFAULT 'SYSTEM',
  `accountantId` varchar(255) DEFAULT NULL,
  `userId` varchar(255) DEFAULT NULL,
  `businessNumber` varchar(255) DEFAULT NULL,
  `visibilityScope` enum('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') DEFAULT NULL,
  `displayOrder` int DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT '1',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounting_section_owner_code` (`chartOwnerKey`,`code`)
) ENGINE=InnoDB AUTO_INCREMENT=97 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

## 4. כרטיסים / accountant-view Excel export

- **File**: `frontend/src/app/shared/category-management/category-management.component.ts`,
  method `addAccountantSheet()` (lines 418–472), called from
  `buildAndDownloadSubCategoriesWorkbook()` → `exportToExcel()`.
- **Header row** (lines 419–422): `'שם הכרטיס', 'מספר הכרטיס', 'הוצאה', 'אחוז מוכר למס
  הכנסה', 'אחוז מוכר למע"מ', 'פחת', 'אחוז פחת', 'חתך (רווח והפסד)', 'קוד 6111'`
- **`קוד 6111` already exists in the mapping**: `row.code6111 || ''` (line 459) — the
  column is wired up, currently rendering blank for every row since every
  `booking_account.code6111` is NULL.
- **Data path**: not a separate DTO/view — it's the same `subCategories()` signal used by
  the other two sheets, sourced from `ExpenseDataService.getAllDefaultSubCategories()` →
  backend `CatalogService`/legacy-shape mapper in `expenses.service.ts`
  (`code6111: acc?.code6111 ?? null`, line 1047) → **directly off
  `booking_account.code6111`**. No intermediate table or cache holds a shadow copy.

## 5. Summary — deliberate category or leftover?

The sub-10000 codes look like **deliberate, still-live technical/balance-sheet accounts,
not orphaned pre-renumbering leftovers** — with one real gap worth a decision:

- All 9 sub-10000 codes (1000, 1100, 1110, 1120, 1200, 2000, 2100, 2400, 2410) match the
  expected set exactly (transfer/bank/cash/credit-card/customers/suppliers/output-VAT/
  input-VAT) and are still present and active-looking, consistent with being
  balance-sheet/clearing accounts rather than P&L expense/income cards.
- They all carry `reportScope = 'pnl'` (the column's own default) but `sectionId = NULL`
  — they don't roll into any חתך. That matches the pattern the entity's own comment
  describes for balance-sheet accounts: *"balance-sheet accounts never join a section
  anyway so the default is harmless there"* (`account.entity.ts`, `reportScope` comment).
  Structurally this reads as intentional: asset/liability accounts never meant to route
  into P&L section grouping, where `reportScope` just wasn't overridden to `technical`
  the way the 90000-range accounts were.
- **Ambiguity to flag, not resolve**: the 90000-range accounts (90100–90600) are
  explicitly `reportScope = 'technical'` and also `sectionId = NULL` — functionally
  identical treatment to the 1000–2410 range, but the low codes are still tagged `'pnl'`.
  Whether that's deliberate ("these are real balance-sheet postable accounts, unlike the
  90000 clearing accounts") or an inconsistency that should also be `technical` is a call
  for Elazar, not guessed here.
- **Can't confirm renumbering timing**: `booking_account` has no `createdAt`/`updatedAt`
  at all, so there's no way to date these 9 rows against the 2026-07-10 chart-renumber
  migration from the DB alone. If needed, that would have to come from
  `account_code_migration` (the old→new code map table) or git history on
  `chart.seed.ts`/`cutover.sql`, not a live-row timestamp.
- **`code6111` is uniformly NULL** across all 70 accounts (not just the low codes) —
  matches the entity comment (*"NULL = not yet sourced — never invent a value here,
  D2/1.3"*) and the master plan's stated open item. The export column is fully wired and
  will populate automatically the moment `code6111` is backfilled — no frontend/backend
  change needed, only data.

No files, schema, or data were modified while producing this audit.
