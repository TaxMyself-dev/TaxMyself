# booking_account / accounting_section / category / sub_category — write-path audit

Date: 2026-08-14
Scope: read-only — no code or data changed. Grepped the whole backend for
every write to these four tables, read every write method in full, and
checked what's actually deployed/documented for production.

Written in response to a request for a complete, accurate map of every write
path before redesigning how chart data is seeded/managed — motivated by two
confirmed silent-overwrite incidents this session (`code6111` being reset by
the boot seeder while backfilling it).

## RESOLVED (2026-08-14, same day) — seeder converted to create-only

`CatalogSeedService.seedAccounts()`/`seedSections()` now leave an existing
row (matched by `chartOwnerKey`+`code`) **completely untouched** — no partial
field refresh, `Object.assign` removed entirely. The seeder's role is now
strictly "create the base chart on an empty DB"; every update to an existing
row (law fields, `isActive`, `code6111`/`category6111`/`subCategory6111`,
name/code corrections) belongs exclusively to the admin screen or a one-off
script from here on — one writer per operation, per row.

**Production-safety implication of §3 above**: the seeder was documented to
run on every production boot (`cutover-day-checklist.md` Step 5, no
`SKIP_BOOT_SEED`), and was safe only as long as `chart.seed.ts` exactly
matched the DB, which the Form 6111 work had already broken (`code6111` in
`chart.seed.ts` didn't reflect the accountant's 59-row mapping). **With this
fix, that's no longer a live risk** — the seeder can never force an existing
production row back to a stale hardcoded value, regardless of what
`chart.seed.ts` says or how many times production reboots. Deploying the
Form 6111 work (formPart, code6111, category6111/subCategory6111, the 321
reference rows) to production is now safe from the seeder-clobber angle
specifically. This does not itself authorize a production deploy — that's a
separate decision for the real cutover — it only clears this particular
blocker.

Verified, not just reasoned about — see the corresponding session work:
booted the real app with `SKIP_BOOT_SEED` deliberately unset (the exact
production/dev boot path) after manually simulating an admin edit
(`isActive=false`, an off-seed `vatPercent`) via raw SQL on two operational
rows; both survived the reboot. Separately seeded a genuinely empty scratch
database on the same host from scratch and confirmed all 68 operational +
16 section + 13 category + 85 sub-category rows were created correctly,
including all 59 `code6111` values — proving the create path still works
for a fresh DB. Scratch DB dropped afterward; `keepintax-dev` untouched by
that part of the test.

`chart.seed.ts` itself was also updated (2026-08-14) so a fresh DB's create
path produces the current, correct state directly: the 59 operational rows
now carry their real `code6111` (from `operational_code6111_map.csv`), the
9 without an official 6111 identity stay `null`. Deliberately NOT added to
the seed: `category6111`/`subCategory6111` — those are derived from
`code6111` via the Tax Authority CSV and owned by the backfill/admin path;
carrying a second hardcoded copy in `chart.seed.ts` would just be another
place for the same value to drift out of sync.

## 1. Every write path

Grepped `backend/src` for every `.save(`/`.insert(`/`.update(`/`Object.assign`
touching these four tables' repos. Exactly **two files** write to them via
TypeORM:

- `backend/src/bookkeeping/catalog.service.ts`
- `backend/src/bookkeeping/catalog-seed.service.ts`

Four other files inject a `BookingAccount` repo (`documents.service.ts`,
`bookkeeping.service.ts`, `account-code-allocator.service.ts`,
`reports.service.ts`) — all confirmed **read-only** (`.find()`/
`.findOneByOrFail()` only; `documents.service.ts`'s injection is entirely
unused — dead code, not a write path).

One more real write path outside `catalog.service.ts`/`catalog-seed.service.ts`:
`demo-data.service.ts`'s profile reset does `deleteAndCount(m, BookingAccount,
{ chartOwnerKey: In(clientChartKeys) })` / same for `AccountingSection` —
**delete-only**, scoped to `CLIENT_<businessNumber>` chart keys for one demo
business at a time. Never touches SYSTEM rows. Runs on `POST
/demo-data/profiles/:id/reset` (admin-triggered HTTP request).

### `catalog.service.ts` — every write method

| Method | Table(s) | Runs when | Insert-vs-update | Columns force-written on an *existing* row |
|---|---|---|---|---|
| `findOrCreateCategory` | category | HTTP (expenses CRUD, D11 flows, seeder) | find-by-(chartOwnerKey,name,type,isActive) → **return as-is if found**, else insert | none (pure create-if-missing) |
| `findOrCreateVariantAccount` | booking_account | HTTP (expense classification when no explicit accountId) | find-by-(chartOwnerKey,isActive,law-fields exact match) → **return as-is if found**, else insert | none (pure create-if-missing; D1 "different percents = different card" means it never edits, only allocates a new card) |
| `createSubCategory` | sub_category (+ may call `findOrCreateVariantAccount`) | HTTP (expenses CRUD, D11, seeder) | always insert (no existing-row branch) | n/a — insert only |
| `updateSubCategoryLaw` | sub_category | HTTP (expense sub-category law edit) | repoints `accountId` on the given row, never touches the card | `accountId`, `approvalStatus` — never a card's own fields (D10: "percents are never edited in place") |
| `deleteCategory` / `deleteSubCategory` | category / sub_category | HTTP (expenses CRUD delete) | soft delete | `isActive = false` only |
| `saveSubCategory` / `saveCategory` | sub_category / category | HTTP (expenses CRUD, misc field edits) | update whatever the caller already mutated in memory | whatever the caller set — thin passthrough |
| `repointSubCategoryAccount` | sub_category (+ may call `findOrCreateCategory`/`createSubCategory`) | HTTP (`PATCH bookkeeping/sub-categories/:id/account`) | update-in-place if row is already CLIENT-owned, else create/repoint a CLIENT override | `accountId`, `approvalStatus` |
| `createAccountWithSubCategory` | booking_account + category + sub_category | HTTP (D11 add-account, admin/accountant activate flows) | always insert (both rows) | n/a — insert only, one transaction |
| `updateAccountFields` | booking_account | HTTP (`PATCH bookkeeping/accounts/:id`, `PATCH admin/booking-accounts/:id`) | update-in-place | only fields explicitly present in the DTO (`name,code,sectionId,code6111,recognitionType,vatPercent,taxPercent,reductionPercent,isEquipment,reportScope`) — **never forces a field to a default**, refuses `'6111-%'` rows |
| `activateReferenceCard` | booking_account + category + sub_category (reads the reference row, never writes it) | HTTP (activate flows) | always insert (delegates to `createAccountWithSubCategory`) | n/a — insert only |
| `deactivateAccount` | booking_account | HTTP (`PATCH admin/booking-accounts/:id/deactivate`) | update-in-place | `isActive = false` only, guarded by the blocking-sub_category check |

**Every one of these is HTTP-request-triggered, none runs on a timer/boot.**
None of them force a column back to a hardcoded default on an existing row
except where the caller explicitly asked for that field to change — this
whole layer is well-behaved. The clobber risk is entirely in the seeder.

### One-off scripts under `backend/scripts/migrations/`

Every script that touches these four tables, in date order (excludes
unrelated billing/drive/OCR schema scripts):

| Script | Table(s) | Status | Idempotent? |
|---|---|---|---|
| `2026-07-10_chart_renumber.sql` | booking_account, accounting_section | One-time, already run (Phase 1.4 renumbering) | N/A — historical |
| `2026-07-10_generate-chart-seed-sql.ts` | (generator, writes `chart.seed.ts`'s SQL equivalent to a file) | Historical, doesn't touch DB directly | N/A |
| `2026-07-12_catalog_migration.ts` + `_schema.sql` | category, sub_category | One-time, already run (Phase 2.1/2.2 — old 4-table → new 2-table migration) | N/A — historical |
| `2026-07-12_generate-catalog-migration-sql.ts` | (generator) | Historical | N/A |
| `2026-07-12_run-catalog-seeder.ts` | all four (via `CatalogSeedService.runSeed()`) | **Standalone invoker of the real seeder** — used to verify the seeder reproduces the already-migrated state exactly (no-op check) against `keepintax_prodcopy`. Refuses `keepintax-dev`. | Confirmed no-op by design *at the time it was written* — see finding below on why that guarantee has since quietly broken. |
| `2026-07-13_phase3_*` (schema/fk/data/backfill/generator) | touches `expense`/`classified_transactions` FKs, not these 4 tables directly (reads booking_account for lookups) | One-time, already run | N/A — historical |
| `2026-07-14_reportscope_card_migration.ts` + schema | booking_account (`reportScope` model change) | One-time, already run | N/A — historical |
| `2026-08-11_add-form-part-to-booking-account.js` | booking_account (`formPart` column + backfill on the 68 operational rows) | This session, applied to `keepintax-dev` only | Yes — but note `formPart` is not in `chart.seed.ts` at all, so it isn't at risk of the seeder-clobber below |
| `2026-08-11_import-6111-reference-cards.js` | booking_account (321 reference rows, insert-only) | This session, applied to `keepintax-dev` only | Yes (count+content guard, hardened this session after the original had a silent content-check gap) |
| `2026-08-13_backfill-formpart-on-reference-rows.js` | booking_account (`formPart` on the 321 reference rows — repair for the above's original gap) | This session, applied to `keepintax-dev` only | Yes |
| `2026-08-14_add-category6111-columns-to-booking-account.js` + `.sql` | booking_account (DDL: `category6111`/`subCategory6111`) | This session, applied to `keepintax-dev` only | Yes |
| `2026-08-14_backfill-operational-code6111.js` | booking_account (`code6111` on 59 operational rows, from the accountant's own CSV) | This session, applied to `keepintax-dev` only | Yes — **but this is the exact column the seeder force-resets; had to be re-applied 3 times this session because of it** |
| `2026-08-14_backfill-category6111-on-reference-rows.js` | booking_account (321 reference rows) | This session, applied to `keepintax-dev` only | Yes |
| `2026-08-14_backfill-category6111-on-operational-rows.js` | booking_account (59 operational rows) | This session, applied to `keepintax-dev` only | Yes — safe from the seeder (see below) |

All 2026-08-x scripts share the same target-DB guard (`DB_DATABASE` must be
exactly `keepintax-dev`, hard refusal otherwise) — **by construction, none
of them has ever run, or could run, against `keepintax_prodcopy` or real
production.**

## 2. The seeder in detail

`CatalogSeedService` (`backend/src/bookkeeping/catalog-seed.service.ts`),
`OnModuleInit`. Three steps, `seedSections()` → `seedAccounts()` →
`seedSystemCatalog()`, each independently try/caught so one failing doesn't
block the others.

**Guard flag**: `SKIP_BOOT_SEED`. Checked once, at the very top of
`onModuleInit()`:
```ts
if (process.env.SKIP_BOOT_SEED === 'true') { return; } // no-op
await this.runSeed();
```
**Off by default** — the seeder runs unless this env var is explicitly set to
the string `'true'`. In dev (`keepintax-dev`, `nest start --watch`), nothing
sets it, so it runs on every single app boot, including every watcher restart
triggered by a file save.

**seedSections()** (`accounting_section`) — for each of 16 rows in
`ACCOUNTING_SECTIONS`: find by `(chartOwnerKey, code)`; if found,
`Object.assign(existing, s)` then save — `s` is
`Pick<'code'|'name'|'ownerType'|'chartOwnerKey'|'displayOrder'>`, so **all
five of those fields are force-written on every boot** if a matching row
exists. If not found, insert.

**seedAccounts()** (`booking_account`) — same shape, for each of the **68**
rows in `CHART_ACCOUNTS`: find by `(chartOwnerKey, code)`; if found:
```ts
Object.assign(existing, rest, { sectionId });
await this.accountRepo.save(existing);
```
where `rest` is everything in `ChartAccountSeed` except `sectionCode`/
`legacyCode`/`legacySource`. I need to correct something I told you earlier
in this session (when I said only `code6111` was at risk) — **`rest`
actually includes far more than that**:

```ts
type ChartAccountSeed = Pick<BookingAccount,
  'code' | 'name' | 'type' | 'pnlCategory' | 'displayOrder' | 'code6111'
  | 'ownerType' | 'chartOwnerKey' | 'isActive'
  | 'vatPercent' | 'taxPercent' | 'reductionPercent' | 'isEquipment'
  | 'recognitionType' | 'reportScope'
> & { sectionCode; legacyCode; legacySource };
```

**Every one of those 15 fields is force-written on every boot**, for every
one of the 68 operational rows, if the row already exists. Confirmed against
real entries in `chart.seed.ts`, e.g.:
```ts
{ code: '60210', name: 'ביטוח רכב', ..., vatPercent: 0, taxPercent: 45,
  reductionPercent: 0, isEquipment: false, recognitionType: RECOGNIZED }
```
and every entry spreads `...SYSTEM_DEFAULTS` which hardcodes `isActive: true`
— grepped the whole file for `isActive: false`, zero matches, so **no
operational row can ever be seed-deactivated; every reboot forces
`isActive` back to `true`.**

`category6111`/`subCategory6111` (the two columns added this session) are
**not** in this Pick type at all — an accident of timing (they were added
after `chart.seed.ts` was last touched), not a deliberate design choice, but
it does mean they're currently safe from this.

**seedSystemCatalog()** (`category`/`sub_category`) — genuinely different
behavior: calls `findOrCreateCategory`/`findSubCategoryInSingleScope` +
`createSubCategory`, both of which are **create-if-missing only** (verified
above in the write-path table) — an existing row is never touched. This part
of the seeder is safe by construction; the doc comment's claim ("existing
rows left untouched") is accurate for this step but not for `seedAccounts`/
`seedSections`.

**Is the seeder the only source of the base 68 accounts?** For a fresh empty
`keepintax-dev`-flavored DB: yes, functionally — `seedAccounts()`'s
insert-if-missing branch is what creates them, no separate seed SQL file
does this independently anymore (the old `account.seed.ts`/
`AccountSeedService` that did was deleted at Phase 2.6). For a DB restored
from `cutover.sql` (i.e., real production's actual bootstrap path): the SQL
migration writes the 68 rows directly, and the seeder's first boot is
*designed* to be a verified no-op against that — see §3.

## 3. Production reality check

**Does the seeder run against production on every deploy?** Yes, by
explicit, documented design decision — `docs/redesign/cutover-day-checklist.md`
Step 5:
> Deploy with `NODE_ENV=production` set as always. **Do not set
> `SKIP_BOOT_SEED`** on the real production deploy — `CatalogSeedService`
> should run its normal boot-time reconciliation... the flag exists only for
> one-off script runs against `keepintax_prodcopy`, not for the real app.

Cross-checked the backend `Dockerfile`: it sets `ENV NODE_ENV production`
but does not set `SKIP_BOOT_SEED` anywhere — consistent with the checklist's
instruction. I can't see the actual Cloud Run service's environment variable
configuration from this repo (that's set outside the codebase), so I can't
directly confirm what's live, but everything in the repo points the same
way: **the seeder is meant to run, and does run, on every real production
boot.**

The design was sound *at cutover time* under one condition the checklist
states explicitly: `cutover.sql` writes data that exactly matches what
`chart.seed.ts`/`catalog.seed.ts` describe, so the first (and every
subsequent) production boot's reconciliation is a verified no-op. **That
invariant is exactly what the Form 6111 work has since broken** — `code6111`
now differs from `chart.seed.ts`'s hardcoded `null` on 59 operational rows
in dev, and `chart.seed.ts` itself was never updated to match. If this data
ever reached a database the seeder runs against with `SKIP_BOOT_SEED` unset,
the very next boot would silently null it back out — the identical bug we
just spent this session fighting in dev, but in production.

**Has any 6111 work touched production?** No — confirmed by construction,
not just belief: every 2026-08-x script (formPart, code6111, category6111,
the 321 reference rows) has an identical guard clause refusing to run
against anything but `DB_DATABASE=keepintax-dev`. None of it has touched
`keepintax_prodcopy` or real production. It is 100% dev-only right now.

**Did real production cutover (the master-plan's Steps 2-6) ever complete?**
Can't confirm from this repo. `docs/redesign/worklog.md`'s last entry is
Session 14 (2026-07-15): *"Elazar is proceeding directly to the real cutover
(Steps 2-6) tonight."* Nothing logged since — that's a full month before
today with no follow-up entry, and `CLAUDE.md`'s "Current phase" line still
reads `cutover-in-progress`, not `cutover-complete`. I have no production DB
credentials configured in this environment (`.env` points only at
`keepintax-dev`), so I can't check live either. Flagging this as unverified
rather than guessing.

## 4. Identity vs. config columns on `booking_account`

| Category | Columns | Notes |
|---|---|---|
| **(a) Structural identity** — set once at creation, never meaningfully changes | `code`, `type`, `chartOwnerKey`, `ownerType`, `accountantId`, `userId`, `businessNumber`, `visibilityScope` | `code`/`chartOwnerKey` form the unique key; changing `code` later is supported by `updateAccountFields` (collision-checked) but is rare/exceptional, not routine |
| **(b) Official 6111 mapping** (added this session) | `code6111`, `category6111`, `subCategory6111`, `formPart` | Sourced externally (Tax Authority CSV / accountant-assigned map), independent of this app's own naming — this is exactly the set that should probably be owned by *one* writer, not shared with the seeder's `rest` blast radius |
| **(c) Accountant-editable config** | `vatPercent`, `taxPercent`, `reductionPercent`, `isEquipment`, `recognitionType`, `isActive`, `name`, `sectionId`, `reportScope` | **This is the category currently double-owned** — both `updateAccountFields`/`deactivateAccount` (admin UI, field-scoped writes) and `seedAccounts()` (boot-time, all-or-nothing `Object.assign` from `chart.seed.ts`) can write every one of these on the 68 fixed operational rows |
| **(d) Ownership/scoping** (overlaps (a)) | `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope` | Set once by whichever `CatalogScope` created the row, never edited afterward by any write path found |

`code`/`pnlCategory`/`displayOrder` sit awkwardly between (a) and legacy
cruft — `pnlCategory` is explicitly dead (Phase 4.4 comment), `displayOrder`
is explicitly temporary (dropped Phase 7); both are still in the seeder's
tracked-field set for the 68 fixed rows even though nothing reads them
anymore.

## 5. Failure modes — full blast radius

Confirmed, currently live (in dev; latent in production per §3):

1. **`code6111` reset to `null`** on every one of the 59 backfilled
   operational rows, on every boot where `chart.seed.ts` still says `null`
   (it does — never updated). Directly observed 3 times this session.
2. **`vatPercent`/`taxPercent`/`reductionPercent`/`isEquipment`/
   `recognitionType` reset to `chart.seed.ts`'s hardcoded value** on every
   boot, for any of the 68 operational rows — meaning **any accountant/admin
   edit made via `PATCH bookkeeping/accounts/:id` or
   `PATCH admin/booking-accounts/:id` (the "כרטיסים" screen, and the new
   Form 6111 admin screen's `ערוך` button) to one of these 68 rows is
   transient** and reverts on the next deploy/restart unless `chart.seed.ts`
   is edited to match. Not directly observed yet this session (nobody has
   edited an operational row's law fields since the last restart), but
   proven by direct code reading, not speculation.
3. **`isActive` forced back to `true`** on every boot for any of the 68
   operational rows — **an admin deactivating one of the original 68 cards
   via the new `כבה` button will have it silently reactivated on the next
   restart.** (Newly *activated* cards from reference rows are safe — they
   get freshly-allocated codes like `61400` that don't exist in
   `CHART_ACCOUNTS` at all, so the seeder's find-by-code never matches them.)
4. **`name`/`code` reset** on the same 68 rows for the same reason — lower
   practical impact (nobody's renaming these), but the same mechanism.
5. **`accounting_section.name`/`displayOrder` reset** on every boot for the
   16 fixed sections — same pattern, smaller blast radius (no UI currently
   edits sections).
6. **Not a failure mode, confirmed safe**: `category`/`sub_category` rows
   are genuinely create-if-missing only in the seeder — an admin's
   category/sub-category edits survive reboots. `formPart`,
   `category6111`, `subCategory6111` are also currently safe, but only
   because `chart.seed.ts` was never updated to track them — not because of
   any deliberate protection. The moment someone adds them to
   `ChartAccountSeed`'s Pick type (a natural thing to do if extending the
   seed data to describe the official 6111 identity too), they'd become
   exposed to the exact same clobber.
7. **Newly-created rows are never at risk** — the seeder only ever matches
   by `(chartOwnerKey, code)` against its own fixed 68/16-entry lists;
   anything created later (D11 add-account, activated reference cards,
   client/accountant-scoped rows) has a code the seeder's lists don't
   contain, so it's structurally untouched by this mechanism regardless of
   how many times the app reboots.
8. **The watcher amplifies this in dev specifically**: `nest start --watch`
   restarts (and thus re-seeds) on *any* backend file save anywhere under
   `backend/` (confirmed empirically — a comment-only edit to a
   `scripts/migrations/*.js` file, well outside `tsconfig`'s `src/` root,
   still triggered a restart), making failure modes 1-5 trigger far more
   often in a dev session than the "one seed per deploy" cadence production
   sees.
