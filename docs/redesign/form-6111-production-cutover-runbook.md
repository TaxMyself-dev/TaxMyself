# Form 6111 catalog project — production deployment runbook

Assembled 2026-08-17 from the actual migration scripts under
`backend/scripts/migrations/` (not from memory), cross-checked against
`git log` from the first 6111 commit (`cab6dfa3`) through the last
(`362ecad7`), and against the live `SHOW CREATE TABLE` output on
`keepintax-dev`. Nothing here has been run against production — this is a
manual runbook for review and deliberate staged execution (phpMyAdmin or
mysql CLI), consistent with this project's no-migration-runner model.

## ⚠️ Prerequisite that isn't part of the 6111 project, but everything below depends on it

`code6111` (the column) and the whole D4 ownership model
(`ownerType`/`chartOwnerKey`/`visibilityScope` etc.) on `booking_account`
were **not** added by this project — they came from the *earlier*
categories-redesign master plan (`2026-07-10_chart_renumber.sql`). That
plan's own cutover to production was, per `docs/redesign/worklog.md`'s last
entry (Session 14, 2026-07-15): *"Elazar is proceeding directly to the real
cutover (Steps 2-6) tonight."* There is no later worklog entry and
`CLAUDE.md`'s "Current phase" line still reads `cutover-in-progress` —
nothing in the repo confirms Steps 2-6 actually completed against real
`keepintax-prod`.

**This cannot be determined from the repo.** If that cutover didn't
complete, `booking_account` in production doesn't have the D4 shape at all
yet, and this entire runbook is inapplicable until that separate, larger
cutover runs first. Verify with a read-only query against prod before
anything else:

```sql
SHOW COLUMNS FROM booking_account;
-- If ownerType/chartOwnerKey/code6111/vatPercent already exist → master-plan cutover is done, proceed below.
-- If booking_account doesn't have these at all → STOP, this is a much bigger prerequisite than the 6111 project.
```

Everything from here on **assumes that cutover already completed** — i.e.,
prod's `booking_account` currently looks like the *pre-6111* state: D4
columns present, `code6111` column present but NULL everywhere, no
`formPart`/`category6111`/`subCategory6111`/`visibleBusinessTypes` columns,
no `6111-%` rows, 68 SYSTEM operational rows (`type` still `NOT NULL`, per
the master plan's own DDL). Confirm this explicitly in Step 4's pre-flight
before touching anything.

---

## Step 1 — every script, in order

Cross-checked against `git log cab6dfa3^..362ecad7` — all 12 scripts land in
exactly 4 commits:

| # | Filename | What it does | Commit | Idempotent? | MODE guard |
|---|---|---|---|---|---|
| 1 | `2026-08-11_widen-booking-account-type.sql` | DDL: widens `booking_account.type` to nullable | `cab6dfa3` | Yes (`MODIFY` is a no-op if already nullable) | No guard itself — driven by #4's check |
| 2 | `2026-08-11_add-form-part-to-booking-account.sql` | DDL: adds `formPart ENUM('A','B','C')` | `cab6dfa3` | Yes | No guard itself — driven by #3 |
| 3 | `2026-08-11_add-form-part-to-booking-account.js` | Runs #2 (if needed) + backfills `formPart` on the 68 operational SYSTEM rows (A by reportScope, C override for 9 balance codes, B override for 61340) | `cab6dfa3` | Yes — updates are `WHERE` re-derivable, re-running reproduces the same end state | ✅ MODE=review/apply CONFIRM=yes |
| 4 | `2026-08-11_import-6111-reference-cards.js` | Runs #1 (if needed) + inserts the 321 reference cards from `tax_authority_6111_full.csv` (repo root, git-tracked) | `cab6dfa3` | Yes — explicit count+content short-circuit before inserting | ✅ MODE=review/apply CONFIRM=yes |
| 5 | `2026-08-13_backfill-formpart-on-reference-rows.js` | **Dev-only repair**, not part of the intended flow — see note below | `7d58a08b` | Yes (`AND formPart IS NULL` guard) | ✅ MODE=review/apply CONFIRM=yes |
| 6 | `2026-08-14_add-category6111-columns-to-booking-account.sql` | DDL: adds `category6111`/`subCategory6111 VARCHAR(255)` | `7d58a08b` | Yes | No guard itself — driven by #7 |
| 7 | `2026-08-14_add-category6111-columns-to-booking-account.js` | Runs #6 (if needed), no backfill | `7d58a08b` | Yes | ✅ MODE=review/apply CONFIRM=yes |
| 8 | `2026-08-14_backfill-operational-code6111.js` | Backfills `code6111` on 59 of the 68 operational rows from `operational_code6111_map.csv` (repo root, git-tracked) | `7d58a08b` | Yes (`AND code6111 IS NULL`) | ✅ MODE=review/apply CONFIRM=yes |
| 9 | `2026-08-14_backfill-category6111-on-reference-rows.js` | Backfills `category6111`/`subCategory6111` on all 321 reference rows, matched by `code`=CSV `internalCode` | `7d58a08b` | Yes (`AND category6111 IS NULL`) | ✅ MODE=review/apply CONFIRM=yes |
| 10 | `2026-08-14_backfill-category6111-on-operational-rows.js` | Backfills `category6111`/`subCategory6111` on the 59 operational rows, fanned out by `code6111` value (multiple cards share one 6111 code) | `7d58a08b` | Yes (`AND category6111 IS NULL`) | ✅ MODE=review/apply CONFIRM=yes |
| 11 | `2026-08-17_convert-business-field-to-enum.js` | Backfills `business.businessField` → `'SERVICE_PROVIDER'` on every row, **then** its own DDL (`MODIFY COLUMN ... ENUM(...)`) | `bc9e7519` | Yes | ✅ MODE=review/apply CONFIRM=yes |
| 12 | `2026-08-17_add-visible-business-types-to-booking-account.js` | DDL: adds `visibleBusinessTypes SET(...)` + backfills every `isActive=1` row (any owner) to all 3 types | `362ecad7` | Yes | ✅ MODE=review/apply CONFIRM=yes |

**About #5**: its own comment explains it exists only because an
*uncommitted, never-landed* draft of #4 was what actually ran against dev on
2026-08-13, leaving `formPart` NULL on all 321 rows — a dev-only accident.
The **currently committed** version of #4 (which is what will run in prod)
already inserts `formPart` correctly at insert time. For a fresh prod run,
#5 should find 0 rows to touch. It's included in the runbook anyway as a
free, idempotent, zero-risk verification pass — not because prod needs the
repair.

---

## Step 2 — Schema (DDL) vs Data (DML), separated

### Schema — exact DDL, in dependency order

Pulled from the scripts and confirmed against dev's actual
`SHOW CREATE TABLE` (not reconstructed from memory).

```sql
-- 1. Widen type to nullable (prerequisite for the 321 reference rows)
ALTER TABLE booking_account
  MODIFY COLUMN type VARCHAR(255) NULL DEFAULT NULL;

-- 2. formPart (prerequisite for the reference-card import, which sets it at insert)
ALTER TABLE booking_account
  ADD COLUMN formPart ENUM('A','B','C') NULL DEFAULT NULL
  COMMENT 'חלק בטופס 6111: A=רוה"פ, B=התאמה למס, C=מאזן';

-- 3. category6111 / subCategory6111
ALTER TABLE booking_account
  ADD COLUMN category6111 VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'official Tax Authority Form 6111 category name',
  ADD COLUMN subCategory6111 VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'official Tax Authority Form 6111 sub-category name';

-- 4. visibleBusinessTypes
ALTER TABLE booking_account
  ADD COLUMN visibleBusinessTypes SET('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR') NOT NULL DEFAULT '';

-- 5. business.businessField — NOT independent DDL, see script #11: this ALTER only
--    runs AFTER that script's own backfill (varchar→enum conversion, not a new column).
--    Included here for completeness, but must stay bundled with its backfill — see Step 4.
ALTER TABLE business
  MODIFY COLUMN businessField ENUM('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR')
  DEFAULT 'SERVICE_PROVIDER' NULL;
```

Confirmed against dev's actual `SHOW CREATE TABLE booking_account` /
`business` (captured live, not reconstructed) — these five ALTERs produce
exactly the current dev column set for both tables.

### Data (DML) — in dependency order

1. **formPart backfill, 68 operational rows** (script #3's embedded
   UPDATEs — 3 statements, order matters, later ones override earlier):
   ```sql
   UPDATE booking_account SET formPart = 'A' WHERE chartOwnerKey = 'SYSTEM' AND reportScope = 'pnl';
   UPDATE booking_account SET formPart = 'C' WHERE chartOwnerKey = 'SYSTEM'
     AND code IN ('1000','1100','1110','1120','1200','2000','2100','2400','2410');
   UPDATE booking_account SET formPart = 'B' WHERE chartOwnerKey = 'SYSTEM' AND code = '61340';
   ```
2. **321-row reference-card import** (script #4) — not a fixed SQL
   statement, it's a CSV-driven batch INSERT (321 rows) — run the script,
   don't hand-transcribe 321 INSERTs.
3. **(redundant safety pass)** formPart repair (script #5) — expect 0 rows
   affected on a fresh prod run.
4. **code6111 backfill, 59 operational rows** (script #8) — CSV-driven
   (`operational_code6111_map.csv`), 59 individual
   `UPDATE ... WHERE code = ? AND code6111 IS NULL` statements — run the
   script.
5. **category6111/subCategory6111 backfill, 321 reference rows**
   (script #9) — CSV-driven, depends on step 2 (rows must exist) and the
   DDL from Schema #3.
6. **category6111/subCategory6111 backfill, 59 operational rows**
   (script #10) — depends on step 4 (`code6111` must be populated first —
   this one fans out *by* `code6111` value).
7. **businessField backfill + its own DDL** (script #11) — self-contained
   unit:
   ```sql
   UPDATE business SET businessField = 'SERVICE_PROVIDER' WHERE businessField IS NULL OR businessField != 'SERVICE_PROVIDER';
   -- verify every row = 'SERVICE_PROVIDER', THEN:
   ALTER TABLE business MODIFY COLUMN businessField ENUM('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR') DEFAULT 'SERVICE_PROVIDER' NULL;
   ```
8. **visibleBusinessTypes backfill** (script #12) — `WHERE isActive = 1`
   (**all** owners, not just SYSTEM — dev's own run caught 2 real
   CLIENT-owned custom cards this way; prod will have its own real count,
   don't hardcode an expected number):
   ```sql
   UPDATE booking_account SET visibleBusinessTypes = 'SERVICE_PROVIDER,COMMERCIAL,CONTRACTOR'
     WHERE isActive = 1 AND visibleBusinessTypes != 'SERVICE_PROVIDER,COMMERCIAL,CONTRACTOR';
   ```

---

## Step 3 — what's environment-dependent

**1. `synchronize` against prod — was it ever on?** No direct evidence
either way from the repo (that's an infra/deploy fact, not something in
git). What can be said: every DDL script above uses `IF`-guarded idempotent
checks (`information_schema.COLUMNS` lookups, `SHOW COLUMNS`) before
altering — so **even if some of these columns already exist in prod for any
reason**, running the scripts is safe; they detect and skip. The one column
genuinely at risk of a *silent* pre-existing state is `code6111` itself
(master-plan-era, not this project's) — if `synchronize` ever ran against
prod between the master-plan cutover and now, columns could have drifted
from what `chart_renumber.sql` originally created. **Verify prod's actual
`booking_account`/`business` schema against dev's captured
`SHOW CREATE TABLE` above before running anything** — that comparison is
the real safety net here, more reliable than trying to reconstruct
synchronize history.

**2. Starting-state assumption — re-confirmed.** Every backfill script's own
commit history and comments are unambiguous: all 12 scripts were written and
run *only* against `keepintax-dev`, each with a hard
`if (process.env.DB_DATABASE !== 'keepintax-dev') throw`. Nothing in this
project's commits touches production connection strings or a prod-copy
database. No evidence any of this reached prod — but see the prerequisite
flagged above: whether the master-plan cutover itself reached prod (which
this whole project's starting-state assumption depends on) also can't be
confirmed from the repo. Verify prod's actual state with:
   ```sql
   SELECT COUNT(*) FROM booking_account WHERE code LIKE '6111-%';        -- expect 0
   SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND isActive=1;  -- expect 68
   SHOW COLUMNS FROM booking_account LIKE 'formPart';                    -- expect empty result (column doesn't exist)
   ```

**3. Create-only seeder — verified safe, but with a real ordering constraint
to flag.** The current `catalog-seed.service.ts` was read in full:
`seedSections`/`seedAccounts`/`seedSystemCatalog` are genuinely
create-if-missing-only now (matched by natural key, existing rows are never
touched, not even a partial field refresh) — commit `7d58a08b`'s claim
holds up in the actual code. **But this surfaces a bigger issue**: TypeORM's
`Repository.find()`/`.save()` generate SQL that references *every* mapped
column on the entity. `BookingAccount` now declares
`formPart`/`category6111`/`subCategory6111`/`visibleBusinessTypes` as real
columns. **If the new application code is deployed and boots against a
database that doesn't have these columns yet, the very first
`booking_account` query — including the seeder's own boot-time query — will
fail with an "unknown column" SQL error.** This means:

   > **Schema DDL must be fully applied to production before the new code is
   > deployed and started. Not "around the same time" — strictly before.**

   The good news: since these are brand-new columns, the *current*
   production app (running old code, with entity classes that don't know
   these columns exist) will completely ignore them if the DDL runs while
   it's still live — additive DDL against a running old app is safe. So the
   DDL can run first, safely, without any downtime or coordination with the
   deploy.

---

## Step 4 — the runbook

### 0. Pre-flight — confirm starting state, halt if anything is unexpected

```sql
-- 0a. THE hard prerequisite — does the master-plan D4 schema exist at all?
SHOW COLUMNS FROM booking_account;
-- HALT if ownerType/chartOwnerKey/code6111/vatPercent are absent — see the flag at the top of this doc.

-- 0b. Confirm the 6111 project truly hasn't landed yet
SELECT COUNT(*) AS ref_rows FROM booking_account WHERE code LIKE '6111-%';
-- HALT if not 0.

SELECT COUNT(*) AS system_active FROM booking_account WHERE chartOwnerKey='SYSTEM' AND isActive=1;
-- Expect 68. If different, someone else already touched operational rows — investigate before proceeding, don't assume.

SHOW COLUMNS FROM booking_account LIKE 'formPart';
SHOW COLUMNS FROM booking_account LIKE 'category6111';
SHOW COLUMNS FROM booking_account LIKE 'visibleBusinessTypes';
-- HALT if any of these already exist — partial prior run, needs manual review, not a blind re-run.

SHOW COLUMNS FROM booking_account LIKE 'type';
-- Expect Null='NO' (still NOT NULL) — if already YES, the widen has somehow already happened.

SHOW COLUMNS FROM business LIKE 'businessField';
-- Confirm this column exists as VARCHAR (not yet ENUM) before script #11's assumptions hold. If it doesn't exist
-- at all, that script's UPDATE will fail — this needs investigation, not a blind run (could not confirm from
-- the repo when/how this column was originally created — it predates every script reviewed for this runbook).
```

### 1. Schema DDL, in order — each followed by inline verification

```sql
-- 1.1
ALTER TABLE booking_account MODIFY COLUMN type VARCHAR(255) NULL DEFAULT NULL;
SHOW COLUMNS FROM booking_account LIKE 'type';  -- expect Null='YES'

-- 1.2
ALTER TABLE booking_account
  ADD COLUMN formPart ENUM('A','B','C') NULL DEFAULT NULL
  COMMENT 'חלק בטופס 6111: A=רוה"פ, B=התאמה למס, C=מאזן';
SHOW COLUMNS FROM booking_account LIKE 'formPart';  -- expect present

-- 1.3
ALTER TABLE booking_account
  ADD COLUMN category6111 VARCHAR(255) NULL DEFAULT NULL COMMENT 'official Tax Authority Form 6111 category name',
  ADD COLUMN subCategory6111 VARCHAR(255) NULL DEFAULT NULL COMMENT 'official Tax Authority Form 6111 sub-category name';
SHOW COLUMNS FROM booking_account WHERE Field IN ('category6111','subCategory6111');  -- expect 2 rows

-- 1.4
ALTER TABLE booking_account
  ADD COLUMN visibleBusinessTypes SET('SERVICE_PROVIDER','COMMERCIAL','CONTRACTOR') NOT NULL DEFAULT '';
SHOW COLUMNS FROM booking_account LIKE 'visibleBusinessTypes';  -- expect present, Default=''
```

**Halt-and-check**: if any `ADD COLUMN` fails with "Duplicate column" —
stop, don't `IF NOT EXISTS`-suppress it blindly; something is already
partially applied and needs to be understood before continuing.

### 2. Data backfills, in order — each with before/after counts

```sql
-- 2.1 formPart on operational rows
SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND formPart IS NOT NULL;  -- before: expect 0
UPDATE booking_account SET formPart = 'A' WHERE chartOwnerKey = 'SYSTEM' AND reportScope = 'pnl';
UPDATE booking_account SET formPart = 'C' WHERE chartOwnerKey = 'SYSTEM'
  AND code IN ('1000','1100','1110','1120','1200','2000','2100','2400','2410');
UPDATE booking_account SET formPart = 'B' WHERE chartOwnerKey = 'SYSTEM' AND code = '61340';
SELECT formPart, COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' GROUP BY formPart;
-- after: record counts (68 operational rows split across A/B/C/NULL — dev split isn't directly comparable
-- since prod's exact operational chart should be identical, but confirm rather than assume equality with dev)
```

```sql
-- 2.2 — run script #4 (2026-08-11_import-6111-reference-cards.js), not hand SQL — 321-row CSV-driven insert.
--       MODE=review first, inspect output, then MODE=apply CONFIRM=yes.
-- Halt-and-check inline in the script itself: it refuses to proceed on ANY code collision.
SELECT formPart, COUNT(*) FROM booking_account WHERE code LIKE '6111-%' GROUP BY formPart;
-- after: expect exactly A=141, B=40, C=140
```

```sql
-- 2.3 — run script #5 as a safety pass (2026-08-13_backfill-formpart-on-reference-rows.js), expect 0 rows.
SELECT COUNT(*) FROM booking_account WHERE code LIKE '6111-%' AND formPart IS NULL;  -- expect 0 before AND after
```

```sql
-- 2.4 — run script #8 (2026-08-14_backfill-operational-code6111.js), CSV-driven, 59 targeted UPDATEs.
SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL;
-- before: record current count (expect 0 on a clean prerequisite state); after: expect exactly 59
```

```sql
-- 2.5 — run script #9 (2026-08-14_backfill-category6111-on-reference-rows.js), CSV-driven, 321 targeted UPDATEs.
SELECT COUNT(*) FROM booking_account WHERE code LIKE '6111-%' AND category6111 IS NOT NULL;
-- before: 0; after: expect exactly 321
```

```sql
-- 2.6 — run script #10 (2026-08-14_backfill-category6111-on-operational-rows.js), depends on 2.4 already done.
SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND category6111 IS NOT NULL;
-- before: 0; after: expect exactly 59
```

```sql
-- 2.7 — run script #11 (2026-08-17_convert-business-field-to-enum.js) — self-contained backfill+DDL.
SELECT businessField, COUNT(*) FROM business GROUP BY businessField;
-- before: whatever prod's real distribution is today (freeform text — record it, don't discard);
-- after: 100% SERVICE_PROVIDER, column is now ENUM
```

```sql
-- 2.8 — run script #12 (2026-08-17_add-visible-business-types-to-booking-account.js) — but its DDL (1.4 above)
--       already ran in Step 1, so this is now JUST the backfill portion. If running the script as-is, it will
--       detect the column already exists and skip straight to backfill (idempotent, safe).
SELECT COUNT(*) FROM booking_account WHERE isActive=1 AND visibleBusinessTypes != 'SERVICE_PROVIDER,COMMERCIAL,CONTRACTOR';
-- before: record prod's actual isActive=1 count (will NOT be 68 — will include real CLIENT/ACCOUNTANT custom
-- cards, same as dev's 68→70 surprise); after: expect 0
SELECT COUNT(*) FROM booking_account WHERE isActive=0 AND visibleBusinessTypes != '';
-- expect 0 both before and after — inactive/reference rows must stay empty
```

### 3. Post-flight — full integrity check

```sql
SELECT formPart, COUNT(*) FROM booking_account WHERE code LIKE '6111-%' GROUP BY formPart;
-- expect A=141, B=40, C=140

SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL;
-- expect 59

SELECT COUNT(*) FROM booking_account WHERE code LIKE '6111-%' AND category6111 IS NOT NULL;
-- expect 321

SELECT COUNT(*) FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND category6111 IS NOT NULL;
-- expect 59

SELECT businessField, COUNT(*) FROM business GROUP BY businessField;
-- expect 100% SERVICE_PROVIDER

SELECT COUNT(*) FROM booking_account WHERE isActive=1 AND visibleBusinessTypes = 'SERVICE_PROVIDER,COMMERCIAL,CONTRACTOR';
-- expect = total isActive=1 count from your own pre-flight snapshot

SELECT COUNT(*) FROM booking_account WHERE isActive=0 AND visibleBusinessTypes != '';
-- expect 0

SHOW CREATE TABLE booking_account;
SHOW CREATE TABLE business;
-- diff against the dev reference captured in Step 2 above — should match exactly modulo AUTO_INCREMENT value
```

### 4. Code deploy — only now

Deploy the application code (all commits through `362ecad7`) **only after**
Steps 1-3 above are complete and verified. Standard deploy, no special
steps — `SKIP_BOOT_SEED` should be unset/false in prod (the seeder is safe
to run now, per Step 3's finding) so the create-only seeder runs its normal
`onModuleInit` pass and no-ops against everything that already exists.

---

## Explicit answer: can this all be manual SQL, or does something need code-deploy ordering?

**Everything above can be pure manual SQL — no migration runner needed**,
consistent with how this project has always worked (no automated
migrations, `cutover.sql`-style manual runbooks). But **the code deploy
itself is not order-independent**, and this is the one thing to flag
hardest:

**Code deploy must happen strictly *after* Steps 1-3 (all DDL and all DML),
never before, never interleaved.** Two distinct failure modes if this gets
flipped:

1. **New code + missing columns → hard crash.** TypeORM generates SQL
   referencing every mapped entity column. Deploy new code before the DDL
   lands, and the very first `booking_account` query (including the
   seeder's own boot query) throws an unknown-column SQL error. This would
   likely break booking_account access app-wide, immediately on deploy.
2. **New code + un-backfilled `visibleBusinessTypes` → silent, total
   outage of expense entry.** This is the subtler one. If DDL has run but
   the backfill (Step 2.8) hasn't, `visibleBusinessTypes` defaults to empty
   on every existing row. New code's visibility filter treats empty as
   "visible to nobody." Every business would see **zero** expense
   categories in the add-expense dropdown, OCR classification catalog, and
   everywhere else `getMergedCategories`/`getMergedSubCategories`/
   `getMergedExpenseCatalog` are used — a real production outage of the
   core expense-entry flow, with no error thrown anywhere (it would just
   look like the catalog is empty).

Both are avoided by the same rule: **all SQL (schema + data) fully complete
and verified, then deploy code, never the reverse.** Since none of the DDL
or DML in this runbook requires the new code to be running (it's all raw
SQL, self-contained), there's no *forward* ordering conflict — only this one
backward one to avoid.
