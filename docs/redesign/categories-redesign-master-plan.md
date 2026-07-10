# KeepInTax — Categories & Accounting Redesign: Master Work Plan

Audience: Claude Code, working in the `taxmyself-dev` repo (NestJS + TypeORM +
MySQL backend, Angular frontend). This plan is the single source of truth for
the redesign. It was written against the audit in `docs/categories-audit.md`
(commit `6ffa67f3`) — read that document first; this plan assumes its findings.

Production has few customers. Data migrations on existing production data are
APPROVED. Do not compromise the target architecture for backward compatibility;
migrate the data instead.

---

## 0. Locked product & architecture decisions

These are final. Do not re-litigate them during implementation.

### D1 — Four-table core model

| Table | Role | Visible to |
|---|---|---|
| `accounting_section` | חתך — P&L grouping | accountant, reports |
| `booking_account` | כרטיס — journal posting target, carries `code6111` | accountant, ledger |
| `category` | display group, client language | client |
| `sub_category` | expense type, client language; points at a `booking_account` | client |

Relationship: `sub_category.accountId → booking_account.id` (many-to-one).
`booking_account.sectionId → accounting_section.id`. System-default
sub-categories happen to map 1:1 to accounts ("category = section,
sub-category = account"), but that is a data coincidence, not a structural
rule — user/accountant sub-categories will be many-to-one.

### D2 — Full renumbering of result accounts

- Balance-sheet & technical accounts **1000–2999 keep their codes** (1100
  bank, 1200 A/R, 2400 output VAT, 2410 input VAT, etc.). All hardcoded
  checks on these codes in VAT report and `buildDocumentJournalLines` stay
  valid.
- Income: `4000 → 40000`, `4010 → 40010`. System income range 40000–49999,
  accountant/client income 50000–59999.
- Expenses: all current 5000–6300 codes are renumbered into 60000–69999
  (system range). Accountant accounts 70000–79999, client-specific accounts
  80000–89999, technical/adjustment 90000–99999.
- `sub_account_code` (5101–6201) and `journal_entry.subCounterAccountCode`
  are **retired**: each sub-ledger concept becomes a real `booking_account`
  in the 60000 range. Migration maps old subAccountCodes into full accounts.
- A one-time migration table `account_code_migration (old_code, new_code)`
  drives UPDATEs on `journal_line.accountCode`,
  `journal_entry.counterAccountCode`, and retires
  `journal_entry.subCounterAccountCode` (fold into `counterAccountCode`
  semantics where it was used as the expense-side sub-ledger; see Phase 1).
- Uniqueness: `UNIQUE(chartOwnerKey, code)` — never `UNIQUE(code)` alone.
- Codes are **strings**, always.
- `getNextAccountCode({ownerType, type, chartOwnerKey})` allocates in jumps
  of 10 within the owner's range; manual codes allowed if unique within the
  chartOwnerKey.

### D3 — P&L and Form 6111 classification

- `accounting_section` **replaces** the string `pnlCategory` namespace
  entirely. `createPnLReportFromJournal` groups by section (joined via the
  posted `accountCode → booking_account.sectionId`). The current
  journal/account-code-driven behavior is the official spec; the phantom
  three-way `expense.pnlCategory` precedence documented in comments is dead
  and must be deleted, not reproduced.
- `booking_account.code6111: string | null` — the Form 6111 field code per
  account (per Tax Authority uniform classification).
- `sub_category` gets optional overrides, default NULL = inherit from the
  account: `pnlSectionId: number | null`, `code6111Override: string | null`.
  When set, they flow into the expense snapshot and journal at posting time.

### D4 — Ownership model

On `category`, `sub_category`, `booking_account`, `accounting_section`:

```
ownerType: 'SYSTEM' | 'ACCOUNTANT' | 'CLIENT'
chartOwnerKey: 'SYSTEM' | 'ACCOUNTANT_<agentFirebaseId>' | 'CLIENT_<businessNumber>'
accountantId: string | null   // agent firebaseId when ownerType=ACCOUNTANT, or creator when accountant created for a client
userId: string | null         // client firebaseId when ownerType=CLIENT
businessNumber: string | null // when ownerType=CLIENT
visibilityScope: 'SYSTEM_DEFAULT' | 'ALL_ACCOUNTANT_CLIENTS' | 'SPECIFIC_CLIENT'
```

Merge/precedence when loading a client's catalog: CLIENT > ACCOUNTANT >
SYSTEM, keyed by name (same override-by-name behavior as today's
`getCategories` merge).

Existing data maps deterministically: `default_*` rows → SYSTEM;
`user_*` rows → CLIENT (chartOwnerKey = `CLIENT_<businessNumber>`).

### D5 — Recognition & approval on sub_category

```
recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'PRIVATE'
approvalStatus: 'APPROVED' | 'PENDING_ACCOUNTANT_APPROVAL' | 'MISSING_ACCOUNTING_MAPPING' | 'REJECTED'
```

- PRIVATE ⇒ accountId NULL, vat/tax 0, excluded from business reports.
- NOT_RECOGNIZED ⇒ vat/tax 0, may map to a dedicated non-deductible account.
- RECOGNIZED requires full mapping before any expense using it can be
  approved; a client with an accountant may create it unmapped ⇒
  `MISSING_ACCOUNTING_MAPPING`.
- Migration mapping from today's `isRecognized` boolean:
  `true → RECOGNIZED`, `false → NOT_RECOGNIZED`. (`PRIVATE` is new; nothing
  maps to it automatically.)

### D6 — Expense snapshot + description

`expense` gains:

```
subCategoryId: number | null (FK → sub_category.id, real DB constraint)
sectionIdSnapshot / sectionCodeSnapshot / sectionNameSnapshot
accountIdSnapshot / accountCodeSnapshot / accountNameSnapshot
code6111Snapshot: string | null
vatPercentSnapshot / taxPercentSnapshot           (rename-in-place: today's taxPercent/vatPercent columns become the snapshot; no data copy needed)
isEquipmentSnapshot / reductionPercentSnapshot     (same rename-in-place)
description: string                                 (see D7)
approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MISSING_ACCOUNTING_MAPPING' | 'NOT_AN_EXPENSE'
approvedByUserId / approvedAt
classificationOverrideByUserId / classificationOverrideAt
```

- The **journal remains the historical source of truth for reports**; the
  expense snapshot serves display/approval/audit. Both are written
  atomically in the same transaction (`persistJournalEntry` flow), at
  approval time.
- Legacy string columns `expense.category` / `expense.subCategory` remain
  as denormalized display copies during transition; source of truth becomes
  `subCategoryId`. They are dropped in Phase 7.
- An expense with `classificationOverrideByUserId` set is NEVER auto
  re-resolved; manual override sticks.

### D7 — Description field (עמודת תיאור)

Computed by a single function `buildExpenseDescription(expense, doc?)`,
fallback chain:

1. Has classification → `"{category}/{subCategory}"` (e.g. `רכב ותחבורה/דלק`)
2. No classification, but source document has a recognized type →
   the type name (e.g. `תרומה`, `טופס 106`), optionally + doc number/supplier
3. Nothing recognized → `מסמך לא מזוהה`

Recomputed on every classification change while PENDING; **frozen at
approval** into `expense.description` and `journal_entry.description`.
Ledger `buildLineDescription` is refactored to read the stored description
instead of rebuilding it per report.

### D8 — Document kind routing (OCR pipeline)

`extracted_document.documentKind: 'EXPENSE_INVOICE' | 'ANNUAL_DOCUMENT' | 'UNIDENTIFIED'`

- EXPENSE_INVOICE → normal expense approval flow.
- ANNUAL_DOCUMENT (תרומה, טופס 106, אישורי מס וכד') → appears in the review
  table with status "לא הוצאה — נשמר לדוח השנתי"; action button is "תייק"
  (file it), NOT "אשר ורשום ביומן". Never creates a journal entry. Stored
  tagged for the annual report.
- UNIDENTIFIED → stuck in PENDING until a human decides: expense (classify)
  / annual document (file) / delete.
- OCR already detects document types; this is routing, not new capability.

### D9 — Approval screen (מסך אישור הוצאות)

- **One screen, two view modes — a toggle, available to everyone** (regular
  / professional). Accountants land on professional by default; permissions
  gate *capabilities* (completing/overriding mapping), not visibility.
- Regular view columns: supplier, date, sum, category, subCategory, vat%,
  status, select-for-approval.
- Professional view columns: date, **description** (single column per D7,
  replaces the category/subCategory pair), sum, section, account, vat%,
  tax%, depreciation%, status.
- Rows with missing mapping cannot be approved. Client with accountant sees
  "חסר מיפוי — אצל הרו״ח" (checkbox disabled). Accountant gets an inline
  completion row: account picker, percents, and a checkbox "החל גם על
  סיווגים עתידיים" — checked = update the sub_category mapping (future
  expenses too), unchecked = one-off snapshot override on this expense only.
- Client WITHOUT an accountant must never be stuck: missing-mapping rows
  offer the simple "למה ההוצאה שייכת?" picker (fuel / vehicle maintenance /
  office equipment / advertising / rent / other...) mapping to system
  accounts behind the scenes.
- Approval = final resolution (sub_category → account → section/6111/
  percents with overrides) + snapshot write + journal entry, one
  transaction.

### D10 — Reclassification & reported-period lock

- Two accountant override paths (both stamp
  `classificationOverrideByUserId/At`):
  1. Single expense: replace `subCategoryId` (full re-resolve + journal line
     replace, reusing today's `syncExpenseJournalEntry` pattern) OR
     mapping-only override (keep subCategoryId, override snapshot fields,
     rewrite journal lines).
  2. Future mapping: update the `sub_category` row itself (accountId /
     percents). History never moves — reports read journal + snapshots.
- Accountants cannot edit SYSTEM sub_category mappings; they create their
  own same-named row (name-keyed override already exists in merge logic).
- **Period lock**: if `expense.isReported = true` (or its
  `vatReportingDate` falls in a submitted period), block reclassification
  with a clear error. Correction entries (סטורנו) in an open period are a
  future feature, explicitly OUT of scope for this plan — just block.

### D11 — Accountant "add account" flow

Screen fields: name, code (auto via getNextAccountCode, editable), section,
code6111, recognition, vat%, tax%, isEquipment, depreciation%, available
for: all my clients / current client only.

- Default behavior: creates **two rows atomically** — a `booking_account`
  (owner = accountant, code in 70000 range) AND a same-named `sub_category`
  pointing at it (carrying the percents/recognition, visibilityScope per
  the "available for" choice).
- Advanced option "כרטיס טכני בלבד" → account row only (for manual journal
  entry targets clients never classify to).
- Creating a new sub_category that points at an EXISTING account (the
  common daily case — "איתוראן" → 60130) touches only `sub_category`.
- Platform-admin (not accountant) is the only role that can add SYSTEM
  accounts.

### D12 — Security prerequisites (Phase 0, before anything else)

1. `POST transactions/load-default-categories` — currently NO guard. Add
   the admin guard (same `UsersService.isAdmin` gate as the other
   default-catalog admin endpoints) or delete the endpoint if the admin
   panel fully replaces it.
2. `FirebaseAuthGuard` delegation lookup must filter
   `status = 'ACTIVE'` and must enforce `scopes` for write operations.
3. `GET delegations/users-for-agent/:agentId` — add auth guard; agents may
   only query themselves.
4. Add `UNIQUE(businessNumber)` on `business` if data allows (verify first).

### D13 — Seed becomes flat data

Replace the 640-line `AccountSeedService` cascade with a flat seed:
sections, accounts (with code6111), SYSTEM categories and sub_categories
with complete mapping on every row. Idempotent upsert keyed on
`(chartOwnerKey, code)` for accounts/sections and
`(chartOwnerKey, categoryName, subCategoryName)` for the catalog. The
7-step keyword-matching cascade is deleted — the migration (Phase 2) does
that resolution once, permanently, as data.

### D14 — Production baseline facts & catalog decisions (2026-07-10)

Verified against production (`keepintax-prod`) via phpMyAdmin:

- Row counts: 12 default_category, 87 default_sub_category, 2 user_category,
  15 user_sub_category, 85 expense, 122 journal_entry, 302 journal_line,
  11 supplier (7 distinct pairs), 196 classified_transactions rules
  (58 distinct pairs).
- **Zero orphaned expenses, zero duplicate catalog rows.** Phase 0.4 reduces
  to adding the UNIQUE constraints; Phase 3.2's orphan-resolution mechanism
  will likely process an empty set (keep the code path, it guards future
  runs). Expense split: 6 on user sub-categories, 79 on the global catalog.
- **Live journal account codes (12 total, 302 lines):** 1100 (122), 2400
  (1), 2410 (56), 4000 (38), 5000 (6), 5100 (11), 5200 (29), 5300 (14),
  5400 (3), 5600 (3), 5700 (1), 6100 (18). Only 4000 + the eight 5xxx/6xxx
  codes renumber; 1200 and 4010 have zero production usage. The Phase 1.4
  UPDATE therefore touches exactly nine code values.
- **Schema drift confirmed:** `journal_entry.subCounterAccountCode` exists
  in the entity but NOT in production (error 1054). The sub-ledger columns
  were never migrated to prod. Consequences: Phase 1.4's
  subCounterAccountCode handling applies to dev only — in production there
  is nothing to migrate from it; simply never create it. Phase 0.6 (drift
  audit) is mandatory before any migration script is written.
- **The 30 unmapped default_sub_category rows are all `isRecognized = 0`**
  — they are the personal-finance side of the product, not missing data.
  Seed decisions, final:
  1. Household/private (אוכל וצריכה שוטפת, ילדים ומשפחה, פנאי וחופשות,
     קניות, בריאות: רופא/תרופות/בדיקות/ביטוח בריאות/קופת חולים) →
     `recognitionType = PRIVATE`, no account, never journaled.
  2. Annual-report items (תרומות מוכרות, ביטוח חיים, ביטוח אובדן כושר
     עבודה, הפקדה לפנסיה) → `reportScope = ANNUAL`, no P&L account; routed
     to the D8 "תייק" flow. Data fixes folded in: ביטוח חיים and ביטוח
     אובדן כושר עבודה are currently mislabeled `pnl` → become ANNUAL; the
     duplicate pension rows (עסק/הפקדה לקרן פנסיה [pnl] and החזרי מס/הפקדה
     לפנסיה (עצמאי) [annual]) merge into ONE ANNUAL sub-category.
  3. Business payments that are not expenses (מקדמות מס הכנסה, גביית
     מע"מ, מקדמות ביטוח לאומי) → technical/balance accounts in the 90000
     range (visible in ledger and cash flow, excluded from P&L sections).

### D15 — Intentional baseline diffs (data corrections)

The "baseline reports must reproduce exactly" rule gets one controlled
exception: a registry file `docs/redesign/intentional-diffs.md` listing
every deliberate correction, its accounting rationale, affected business,
and expected numeric delta per report. The Phase 1.7/3.6/4.6 comparison
script must show ZERO diffs outside this registry.

Registered correction #1: business 204245724 has six journal entries
(ids 10000145, 10000158, 10000167, 10000173, 10000186, 10000203; ₪22,645
gross debit, ₪11,775.40 total `amountForTax`) posting מקדמות ביטוח לאומי
to account 5000 as a P&L expense. Per D14 decision 3, the migration remaps
these to the Bituach Leumi technical account — the business's P&L expense
total (the "הוצאות בלתי מזוהות" category) is EXPECTED to drop by exactly
₪11,775.40 (the summed `amountForTax` — that's what
`createPnLReportFromJournal` actually sums into the P&L, not the gross
debit), and its VAT report is unaffected (no VAT lines). Verified 2026-07-10
against `docs/redesign/baseline-reports/204245724.json` and
`docs/redesign/intentional-diffs.md` entry #1 — Elazar approved this exact
figure, correcting an earlier "~₪29,645" placeholder that didn't match the
data.

---

## Phase 0 — Safety, security, data audit

**Goal:** safe ground before touching schema.

- [x] 0.1 Full production DB backup (mysqldump). Verify restore works on a
      local copy. All later phases are rehearsed on this copy first.
      (`_prod_dump/keepintax-prod.sql`, restored into `keepintax_prodcopy`
      and re-verified restorable multiple times during Session 1.)
- [x] 0.2 Run the production audit queries (provided separately in chat;
      also in `docs/categories-audit.md` §8). Record results in
      `docs/redesign/production-baseline.md`: row counts, orphan pairs,
      duplicate catalog rows, live journal account codes, supplier/rule
      shadow counts.
- [ ] 0.3 Implement D12 security fixes. Each is a small, independent
      commit, deployable on its own. Ship to production immediately —
      these do not wait for the cutover. (Deferred to Session 8 per
      Elazar. D12.4 specifically is investigated and staged in
      `cutover.sql` §2 — see `production-baseline.md` — ready for Session
      8 to deploy.)
- [x] 0.4 Clean duplicates found by query 3 (manual SQL, reviewed), then
      add `UNIQUE(categoryName, subCategoryName)` to `default_sub_category`
      and `UNIQUE(firebaseId, businessNumber, categoryName, subCategoryName)`
      to `user_sub_category` — these protect the Phase 2 migration.
      (Zero duplicates found; both constraints applied and verified
      against `keepintax_prodcopy`, recorded in `cutover.sql` §1.)
- [x] 0.5 Snapshot verification baseline: run `createVatReportFromJournal`,
      `createPnLReportFromJournal`, and `createLedgerReport` for ALL active
      businesses for all periods with data; save outputs as JSON fixtures in
      `docs/redesign/baseline-reports/`. These are the golden files —
      Phases 1–4 must reproduce them (with renumbered codes) exactly,
      modulo the D15 intentional-diffs registry.
- [x] 0.6 **Schema drift audit (mandatory — drift already confirmed, see
      D14).** Generate `SHOW COLUMNS`/`SHOW INDEX` statements for every
      table this plan touches (all category tables, expense, journal_entry,
      journal_line, default_booking_account, supplier,
      classified_transactions, extracted_document, business, delegation,
      user), have Elazar run them against production, and diff
      systematically against the TypeORM entities. Output:
      `docs/redesign/schema-drift.md` — every column/index that exists in
      code but not in prod (and vice versa), each with a decision: add via
      migration script, or delete from the entity because the new model
      supersedes it (e.g. `journal_entry.subCounterAccountCode` is
      superseded by D2 → remove from the entity, do NOT add to prod).
      No Phase 1+ migration script may be written before this document is
      complete.

**Definition of done:** backup restorable, security PRs live, baseline
fixtures committed, `schema-drift.md` complete with a decision per gap,
D14/D15 numbers recorded in `production-baseline.md`.

---

## Phase 1 — New chart of accounts

**Goal:** sections table, enriched accounts table, full renumbering, with
journal history migrated.

- [ ] 1.1 New entity `AccountingSection` (table `accounting_section`):
      `id, code (string), name, ownerType, chartOwnerKey, accountantId,
      userId, businessNumber, displayOrder, isActive, timestamps`,
      `UNIQUE(chartOwnerKey, code)`.
- [ ] 1.2 Extend `DefaultBookingAccount` → rename entity/table to
      `BookingAccount` (`booking_account`): add `sectionId (FK)`,
      `code6111`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`,
      `businessNumber`, `visibilityScope`, `isActive`. Replace
      `UNIQUE(code)` with `UNIQUE(chartOwnerKey, code)`. `pnlCategory` and
      `displayOrder` remain temporarily (dropped Phase 7); sections take
      over their role.
- [ ] 1.3 Author the new SYSTEM chart as flat seed data
      (`bookkeeping/chart.seed.ts`): sections (from the current 18 P&L
      categories + rehome of pnlCategory strings), accounts in the new
      ranges, `code6111` per account (source the 6111 field codes from the
      official uniform classification; leave NULL + TODO where uncertain
      and log them — do NOT invent codes). Every current account and every
      current `subAccountCode` gets a row; build
      `account_code_migration (old_code, new_code, source)` covering:
      4000→40000, 4010→40010, each 5000–6300 code → its 60000-range code,
      each subAccountCode 5101–6201 → its own 60000-range account code.
- [ ] 1.4 Production migration script
      (`backend/scripts/migrations/2026-07-XX_chart_renumber.sql` + a
      TypeScript runner for the seeded parts), in ONE transaction:
      create tables → seed sections/accounts → UPDATE
      `journal_line.accountCode`, `journal_entry.counterAccountCode` via
      the migration map. Per D14, production has exactly nine live code
      values to remap (4000 + eight 5xxx/6xxx codes; 1100/2400/2410 stay);
      `subCounterAccountCode` does NOT exist in production — nothing to
      migrate from it, remove it from the entity (per Phase 0.6 decision).
      In dev/staging DBs where the column does exist, derive the new
      account from it where non-null before dropping. The six account-5000
      Bituach-Leumi entries of business 204245724 are remapped to the
      90000-range technical account per D14/D15, not to a 60000 expense
      account.
- [ ] 1.5 `getNextAccountCode` service + unit tests (range per
      ownerType/type, jumps of 10, per-chartOwnerKey isolation, manual
      out-of-sequence codes tolerated).
- [ ] 1.6 Update every hardcoded result-account code:
      `buildDocumentJournalLines` (4000/4010 → 40000/40010),
      `createVatReportFromJournal` (same), manual-entry account dropdown
      filter (pnlCategory IS NOT NULL → sectionId IS NOT NULL), SHAAM B100
      (verify field width tolerates 5-digit codes), ledger balance-direction
      logic (unchanged — still by `type`).
- [ ] 1.7 Verification: regenerate all Phase 0.5 baseline reports; totals
      must match exactly; ledger account codes must match through the
      migration map. Automated comparison script, committed.

**Definition of done:** production journal fully on new codes, all reports
reproduce baseline totals, old code ranges absent from `journal_line`.

---

## Phase 2 — Unified category & sub_category tables

**Goal:** the new two-table catalog, migrated from the four old tables.

- [ ] 2.1 New entities `Category` (table `category`) and `SubCategory`
      (table `sub_category`) exactly per D1/D3/D4/D5:

      Category: `id, name, type ('EXPENSE'|'INCOME'), defaultRecognitionType,
      ownerType, chartOwnerKey, accountantId, userId, businessNumber,
      visibilityScope, isDefault, isActive, createdByUserId, timestamps`,
      `UNIQUE(chartOwnerKey, name, type)`.

      SubCategory: `id, categoryId (FK), name, recognitionType,
      accountId (FK → booking_account, nullable), pnlSectionId (FK,
      nullable, override), code6111Override, vatPercent, taxPercent,
      isEquipment, reductionPercent, necessity, reportScope, ownerType,
      chartOwnerKey, accountantId, userId, businessNumber, visibilityScope,
      approvalStatus, approvedByUserId, approvedAt, rejectedByUserId,
      rejectedAt, rejectionReason, isDefault, isActive, createdByUserId,
      timestamps`, `UNIQUE(chartOwnerKey, categoryId, name)`.
- [ ] 2.2 Data migration (script, one transaction, rehearsed on the
      backup):
      `default_category` → `category` (SYSTEM);
      `default_sub_category` → `sub_category` (SYSTEM; `isRecognized` →
      recognitionType per D5; `accountCode`/`subAccountCode` → `accountId`
      via the Phase 1 migration map — subAccountCode wins when present, it
      is more specific; `pnlCategory` string → nothing (sections own it
      now); approvalStatus = APPROVED);
      `user_category` → `category` (CLIENT, chartOwnerKey =
      `CLIENT_<businessNumber>`);
      `user_sub_category` → `sub_category` (CLIENT; same rules; parent
      categoryId resolved by name within CLIENT scope, falling back to the
      SYSTEM category of the same name — record unmatched parents in a
      migration log table for manual review).
- [ ] 2.3 New `CatalogService`: single resolution query replacing
      `resolveAccountCode`'s 5-level chain — load merged catalog for a
      business (CLIENT > ACCOUNTANT > SYSTEM by name), resolve
      subCategoryId → account → section/6111/percents including D3
      overrides. Old `resolveAccountCode` becomes a thin adapter over it
      during transition (same signature, string in / code out) so existing
      callers keep working until Phase 4.
- [ ] 2.4 Port catalog CRUD endpoints to the new tables behind the SAME
      routes/DTO shapes the Angular app already calls (`get-categories`,
      `get-sub-categories`, add/update/delete user category endpoints,
      admin default-catalog endpoints). Frontend keeps working unchanged.
      Delete-safety checks (classified_transactions references) preserved.
- [ ] 2.5 Old four tables become read-only (remove all write paths;
      keep tables for rollback until Phase 7).
- [ ] 2.6 Replace `AccountSeedService` with the flat idempotent seeder
      (D13). Delete the 7-step cascade and
      `transactions/load-default-categories` (superseded).
- [ ] 2.7 Tests: migration script unit-tested against fixture DB built
      from production baseline shapes; catalog merge precedence tests;
      resolution parity test — for every (category, subCategory) pair in
      the production baseline, old `resolveAccountCode` output == new
      CatalogService output (through the code migration map).

**Definition of done:** new catalog serves all reads/writes, parity test
green on full production pair list, old tables frozen.

---

## Phase 3 — FK backfill & expense snapshots

**Goal:** expenses (and shadow tables) point at real sub_category ids;
snapshot columns populated.

- [ ] 3.1 Schema: add D6 columns to `expense`; add `subCategoryId` to
      `supplier`, `classified_transactions`, `extracted_document` (nullable
      FK; string columns stay for display). Add `documentKind` to
      `extracted_document` (D8), default backfill: rows already converted
      to expenses → EXPENSE_INVOICE; others → infer from stored docType if
      possible, else UNIDENTIFIED.
- [ ] 3.2 Backfill `expense.subCategoryId` by (category, subCategory,
      userId, businessNumber) against the merged catalog. Orphans (Phase 0
      query 2ב tells us how many): create CLIENT sub_categories with
      approvalStatus = MISSING_ACCOUNTING_MAPPING for pairs that look like
      real user classifications; garbage/typo pairs get mapped to a
      decision list for Elazar to resolve manually — produce
      `docs/redesign/orphan-resolution.md` with the proposed action per
      pair, do not guess silently.
- [ ] 3.3 Backfill snapshots for APPROVED/journal-posted expenses FROM THE
      JOURNAL (not from the live catalog — the journal is what actually
      happened): join expense → journal_entry → lines to fill
      accountCodeSnapshot etc.; percent columns are renamed in place (D6).
      Expenses with a journal entry → approvalStatus = APPROVED; without →
      PENDING (or MISSING_ACCOUNTING_MAPPING if their sub_category is).
- [ ] 3.4 Backfill `expense.description` (D7 chain) and copy into
      `journal_entry.description` where empty.
- [ ] 3.5 Add the FK constraints (after backfill is clean). Same for
      supplier/classified_transactions backfills (by name within scope;
      unmatched → NULL + logged).
- [ ] 3.6 Verification: 0 approved expenses with NULL subCategoryId or
      NULL snapshots; ledger/VAT/P&L still reproduce Phase 1 outputs.

**Definition of done:** every approved expense has FK + snapshot + frozen
description; orphan decision doc resolved with Elazar.

---

## Phase 4 — Code cutover

**Goal:** all runtime paths use the new model; adapters deleted.

- [ ] 4.1 Expense creation/approval flow: `addExpense` and the three
      `ReportReviewService.approve*` paths take `subCategoryId` (with
      name-based fallback removed at the end of this phase), run
      CatalogService resolution, write snapshot + description + journal in
      one transaction. Enforce: cannot approve when resolution incomplete
      (MISSING_ACCOUNTING_MAPPING), cannot reclassify when `isReported`
      (D10 lock), never auto re-resolve overridden expenses.
- [ ] 4.2 Reclassification endpoints per D10: single-expense (full /
      mapping-only) + future-mapping update; both journal-line-replacing
      via the `syncExpenseJournalEntry` pattern; override stamps.
- [ ] 4.3 OCR pipeline: `buildExtractionCatalog` reads the new catalog;
      OCR output sets `documentKind`; review flow routes per D8
      (EXPENSE_INVOICE → approval, ANNUAL_DOCUMENT → "תייק" flow with
      NOT_AN_EXPENSE status, UNIDENTIFIED → pending triage).
- [ ] 4.4 Reports: P&L groups by section (D3); ledger uses stored
      descriptions (D7); delete dead `resolvedPnlCategory`/
      `getPnlCategoryMap` precedence code and the misleading comments;
      `ExpensePnlDto.category` renamed to `sectionName`.
- [ ] 4.5 Manual journal entry: account dropdown from new
      `booking_account` (sections shown as groups); free-text
      subCategoryName field replaced by optional sub_category picker +
      free-text description.
- [ ] 4.6 Delete `resolveAccountCode` adapter, `resolveSubAccountCode`,
      and every read of the old four tables. Jest suite: port the existing
      43 journal tests + add coverage for resolution overrides (D3),
      period lock, override stickiness, description chain, documentKind
      routing. Full baseline-report regression one more time.

**Definition of done:** grep shows zero references to
default_/user_category tables outside migration scripts; test suite green;
baseline reports reproduce.

---

## Phase 5 — Accountant layer

**Goal:** accountants operate on the catalog per D4/D11, safely.

- [ ] 5.1 Authorization: delegation-aware guard usage on all catalog and
      approval endpoints (building on Phase 0 fixes). An accountant acting
      via `x-client-user-id` may: complete/override mappings, approve
      expenses, create ACCOUNTANT/CLIENT catalog rows. May NOT edit SYSTEM
      rows (admin only).
- [ ] 5.2 D11 add-account flow: `POST bookkeeping/accounts` — atomic
      account (+ optional paired sub_category) creation, getNextAccountCode
      allocation, "all my clients / current client" scoping, technical
      account option.
- [ ] 5.3 Client-creates-unmapped flow (D5): client with an active
      delegation may save a RECOGNIZED sub_category without mapping →
      MISSING_ACCOUNTING_MAPPING; accountant completion UI (the inline row
      from D9) sets mapping + approvalStatus=APPROVED; the "החל גם על
      סיווגים עתידיים" checkbox decides sub_category update vs one-off
      snapshot override.
- [ ] 5.4 Accountant catalog management screen: list categories/
      sub_categories across the three layers with owner badges;
      pending-approval queue (sub_categories with
      MISSING_ACCOUNTING_MAPPING / PENDING_ACCOUNTANT_APPROVAL across their
      clients).

**Definition of done:** an accountant can fully service a client
(create accounts, complete mappings, approve) with enforced scopes; a
client without an accountant is never blocked (D9 simple picker path).

---

## Phase 6 — Frontend (Angular)

**Goal:** the approval screen and catalog UIs per D9, on the new APIs.

- [ ] 6.1 Approval screen rebuild per D9: regular/professional toggle
      (persisted per user), regular = category+subCategory columns,
      professional = single description column + section/account/vat/tax/
      depreciation columns; status badges (מוכן / חסר מיפוי / אצל הרו״ח /
      מופה ע״י רו״ח with override icon / לא הוצאה — נשמר לדוח השנתי);
      bulk-select approve; inline mapping-completion row (accountant/
      capability-gated) with the future-mapping checkbox; simple "למה
      ההוצאה שייכת?" picker for unaccompanied clients; live-resolution
      preview pre-approval, snapshot display post-approval.
- [ ] 6.2 Category management screens on new endpoints: client add
      category (name + default recognition) / add sub_category (the D5
      three-option flow: private / not recognized / recognized→mapping or
      defer-to-accountant); accountant screens from 5.4; admin SYSTEM
      catalog screen replacing CategoryManagementComponent's direct
      default_sub_category editing.
- [ ] 6.3 ModalExpensesComponent / add-supplier: cascading pickers on new
      catalog, autofill percents from sub_category, emit subCategoryId.
- [ ] 6.4 Ledger/P&L pages: section grouping in P&L, description column in
      ledger, account picker shows new codes.

**Definition of done:** no Angular service calls a removed endpoint; a full
manual E2E pass of: upload doc → OCR → review → classify → approve →
ledger/VAT/P&L, in both view modes, as client and as accountant.

---

## Phase 7 — Cleanup (after 2–4 weeks of stable production)

- [ ] 7.1 Drop tables `default_category`, `default_sub_category`,
      `user_category`, `user_sub_category`.
- [ ] 7.2 Drop columns: `expense.category/subCategory` (strings),
      `expense.pnlCategory`, `expense.reportScope` (moved to sub_category),
      `journal_entry.subCounterAccountCode`, `journal_entry.subCategory`
      (superseded by description), `journal_line.subCategoryName` (same),
      `booking_account.pnlCategory/displayOrder`, string category columns
      on supplier/classified_transactions/extracted_document once UI reads
      via FK, legacy transactions-table columns left as-is (legacy table,
      untouched).
- [ ] 7.3 Delete migration adapters, fix the `jouranl-*.entity.ts` filename
      typos while touching them, final grep for dead references.

---

## Session runbook — the exact execution order

This section is the operator's guide for Elazar. Each session below is a
fresh Claude Code session. Copy the prompt as-is. Sessions marked A/B may
run IN PARALLEL in separate terminals — they touch disjoint files.
Everything else is sequential.

Standing rules (already in CLAUDE.md, repeated for clarity): commit after
every task, tick the checkbox in this plan, append to worklog.md. All DB
work runs against the local `keepintax_prodcopy` database.

### Session 1 — Phase 0, all of it

```
Read docs/redesign/categories-redesign-master-plan.md in full.
Phase 0. Production access is deferred — everything runs against a local
copy of production data.
Step 1: import _prod-dump/keepintax-prod.sql into a new local MySQL
database keepintax_prodcopy (find the mysql client yourself, utf8mb4,
verify row counts against D14; ask me for credentials).
Step 2 (0.6): SHOW COLUMNS / SHOW INDEX on keepintax_prodcopy for every
listed table, diff vs the TypeORM entities, write
docs/redesign/schema-drift.md with a decision per gap.
Step 3 (0.5): write backend/scripts/generate-baseline-reports.ts, run it
against keepintax_prodcopy, commit the JSON fixtures.
Step 4 (0.2 + 0.4): write production-baseline.md from D14; append the two
UNIQUE constraints as the first section of cutover.sql.
Stop and ask if anything conflicts with the plan (rule 5).
```

Elazar between steps: provide DB credentials; review schema-drift.md
decisions. After: set `Current phase: 1` in CLAUDE.md.
(Task 0.3 security fixes are deferred to Session 8 per the decision to
avoid production deploys until the cutover.)

### Session 2 — Phase 1: the new chart (1.1–1.3) — HEAVY, work WITH it

```
Read docs/redesign/categories-redesign-master-plan.md and
docs/redesign/schema-drift.md.
Phase 1, tasks 1.1, 1.2, 1.3: AccountingSection entity, booking account
entity extension, and the new SYSTEM chart seed with the
account_code_migration map, applying D14's catalog decisions. Present the
full proposed chart (sections, accounts, codes, 6111 where certain,
NULL+TODO where not) as a review table BEFORE writing the seed — I will
correct codes and 6111 mappings, then you implement.
```

Elazar: this is the session where you review every account code and 6111
mapping. Budget real time for it.

### Session 3A — Phase 1: getNextAccountCode (1.5) — may run parallel to Session 2

```
Read docs/redesign/categories-redesign-master-plan.md.
Phase 1, task 1.5: implement getNextAccountCode with unit tests (range
per ownerType/type, jumps of 10, per-chartOwnerKey isolation, manual
out-of-range codes tolerated).
```

### Session 4 — Phase 1: renumbering script (1.4) — Plan Mode ON

```
Phase 1, task 1.4 per the plan: the renumbering script (nine live codes,
D14/D15 Bituach Leumi remap to the 90000 technical account, no
subCounterAccountCode in prod). Run against keepintax_prodcopy, show me
verification SELECTs before/after, append the final version to
cutover.sql.
```

### Session 5 — Phase 1: code updates + verification (1.6, 1.7)

```
Phase 1, tasks 1.6 and 1.7: update every hardcoded account code listed in
1.6, run the baseline comparison against the migrated keepintax_prodcopy,
report any diff not covered by intentional-diffs.md.
```

After: `Current phase: 2`.

### Session 6 — Phase 2: schema + migration (2.1–2.3) — Plan Mode ON

```
Phase 2, tasks 2.1, 2.2, 2.3: the unified category/sub_category entities,
the data migration from the four old tables (run on keepintax_prodcopy,
show verification counts), and the CatalogService with the
resolveAccountCode adapter. Present the migration plan first.
```

### Session 6B — Phase 2: CRUD port (2.4–2.7)

```
Phase 2, tasks 2.4–2.7: port the catalog CRUD endpoints behind the same
routes/DTOs, freeze old-table writes, replace AccountSeedService with the
flat seeder, and the parity test over every production (category,
subCategory) pair.
```

### Session 7 — Phase 3 (all): FK backfill & snapshots

```
Phase 3, all tasks, per the plan. Production has zero orphans (D14) so
3.2 should backfill 100% automatically — if ANY row fails to match, stop
and show me. Run everything on keepintax_prodcopy, append to cutover.sql,
finish with the 3.6 verification.
```

After: `Current phase: 4`.

### Session 8 — Phase 4: write paths (4.1–4.3) + the deferred 0.3

```
Phase 4, tasks 4.1, 4.2, 4.3, plus the deferred Phase 0.3 security fixes
(D12) as separate commits. Plan Mode for 4.1.
```

### Session 9 — Phase 4: reports + dead-code removal (4.4–4.6)

```
Phase 4, tasks 4.4, 4.5, 4.6: reports to sections, manual entry picker,
delete the legacy resolver and old-table reads, port + extend the test
suite, full baseline regression.
```

After: `Current phase: 5`.

### Session 10 — Phase 5 (all): accountant layer

```
Phase 5, all tasks per the plan: delegation-aware authorization, the D11
add-account flow, the client-unmapped flow, and the accountant catalog
management backend.
```

After: `Current phase: 6`.

### Sessions 11A / 11B — Phase 6 frontend (parallel, different components)

11A:
```
Phase 6, task 6.1: the approval screen per D9 — both view modes, the
description column, status badges, inline mapping completion, the simple
picker for clients without an accountant.
```

11B:
```
Phase 6, tasks 6.2–6.4: category management screens, modal-add-expenses /
add-supplier on the new catalog, ledger/P&L page updates.
```

After: `Current phase: cutover-ready`.

### Session 12 — Cutover prep

```
We are cutover-ready. Assemble the final cutover.sql review: walk me
through it section by section with the embedded verification SELECTs,
then produce the cutover-day checklist filled in with our actual file
names and databases, per the plan's cutover section.
```

Elazar executes the cutover checklist manually. Phase 7 cleanup = one
more short session 2–4 weeks later, plus re-running /docs-app-map to
regenerate the per-topic CLAUDE.md docs (they describe the old
architecture).

### Parallelism rules

- Safe pairs: 2‖3A, 6B‖7-start, 11A‖11B. Nothing else — all other phases
  chain through shared files (expenses.service, reports.service,
  entities).
- Two sessions must never touch the same file; only the primary session
  of a pair updates this plan's checkboxes.
- Realistic ceiling: one working session + one helper session. Elazar is
  the only reviewer — review bandwidth, not typing speed, is the
  bottleneck.

---

## Execution rules for Claude Code

**Deployment model: build everything in dev, then ONE manual production
cutover.** There is no migration runner. Dev schema evolves via TypeORM
`synchronize`; production is updated once, manually, at the end.

1. Work phase by phase in dev. Commit locally after every completed task
   (pushing to remote is at Elazar's discretion, not part of the loop). A
   phase is "done" when verified in dev **against a restored copy of
   production data** — never against synthetic dev data alone. Do not
   start phase N+1 before phase N passes the baseline-report comparison
   on that copy.
2. Maintain `docs/redesign/cutover.sql` as a single cumulative,
   ordered script, updated at the end of every phase. It must contain
   EVERY schema change (the CREATE/ALTER statements equivalent to what
   `synchronize` did in dev — derive them by diffing entities against the
   Phase 0.6 production `SHOW COLUMNS` output, never from memory) and
   EVERY data transformation (renumbering UPDATEs, catalog migration,
   backfills), in exact execution order, idempotent where possible.
   Schema drift between dev and prod is the known failure mode of this
   workflow (see D14) — the cumulative script is the defense.
3. Exception to the single-cutover model: Phase 0.3 security fixes ship
   to production immediately — they touch no schema and the exposure is
   live today.
4. The Phase 0.5 baseline report fixtures are sacred: any diff in totals at
   any phase is a blocker, not a footnote — UNLESS it appears, with its
   exact expected delta, in `docs/redesign/intentional-diffs.md` (D15) and
   Elazar has explicitly approved it.
5. Where this plan and reality conflict (a column that doesn't exist, a
   flow the audit missed), STOP and surface the conflict to Elazar rather
   than improvising a schema decision.
6. Windows dev machine: PowerShell syntax for any shell commands in docs.

## Production cutover checklist (executed once, after Phase 6 is verified in dev)

1. Full rehearsal: restore a FRESH production dump, run the complete
   `cutover.sql` on it end-to-end, run the verification suite (baseline
   comparison + D15 registry), fix and repeat until clean. The final
   rehearsal must run the exact file that will run in production.
2. Announce a short maintenance window; stop the backend (no writes
   during cutover).
3. Fresh production backup (mysqldump / Cloud SQL export). Verify it.
4. Run `cutover.sql` in phpMyAdmin, section by section, checking each
   section's built-in verification SELECTs before continuing.
5. Deploy the new backend + frontend.
6. Run the post-cutover verification queries and regenerate all reports;
   compare against baseline + intentional diffs. Any unexplained diff →
   restore the backup, redeploy old code, investigate in dev.
7. Unfreeze. Phase 7 cleanup runs as a second, small manual script 2–4
   weeks later.