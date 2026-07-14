# Phase 1.1–1.3 review — new chart of accounts (REVISED 2026-07-10, chart-revision session)

Status: **APPROVED 2026-07-10 — committing.** `backend/src/` was written
this session (entity + `chart.seed.ts` + `RecognitionType` enum), presented
here for review, and all decisions below were resolved by Elazar the same
day. Supersedes the original 2026-07-10 Session 2 version of this file in
full (D1/D3/D5/D9/D11 and tasks 1.2/1.3 were revised that same day:
accounting law moved from `sub_category` onto the card).

**Addendum 2026-07-14 (model change, applied directly to `chart.seed.ts` /
`account.entity.ts` / `src/enum.ts`):** `RecognitionType` gained a third
value, `NOT_APPLICABLE`, and `reportScope` (`'pnl' | 'annual' | 'technical'`,
previously a `sub_category`-only field) moved onto `booking_account` — "the
card carries the full accounting law" (D1) now applies to report routing
too, not just VAT/tax/equipment percents. This addendum applies the change
to the two card groups that needed it: the 90000-range technical accounts
(§3e, now explicit `NOT_APPLICABLE`/`TECHNICAL` instead of implicit
`sectionId = NULL`) and five new ANNUAL cards (§3f, replacing the retired
`sub_category`-level "no card at all, `reportScope=ANNUAL`" bucket). See §3e,
§3f, and §5 below for the updated tables and rationale; §0–§4 and §6 are
unchanged from 2026-07-10 and left as originally approved.

Source data: `backend/src/bookkeeping/chart.seed.ts` (as rebuilt this
session), and a **live read-only query against `keepintax_prodcopy`.
default_sub_category** (87 rows, queried via `mysql2`, 2026-07-10). This
replaces `account-seed.service.ts`'s `SUBCATEGORY_TAX_VAT_DEFAULTS` as the
source of percents; that hardcoded table is stale in multiple places
(see §6).

---

## 0. Decisions (resolved 2026-07-10)

**Carried over from the original Session 2 review, still open (deferred, not
blocking this commit):**
1. `code6111` — still NULL/TODO on every account. No verified source for the
   official Form 6111 code list yet.
2. Sections: still 16 (not the plan text's "18") — see original rationale,
   unchanged.

**This session's four decisions:**

3. **"מתנות מוכרות"**: `tax=100`, `vat=0` (confirmed — corrected the earlier
   100/100 placeholder). Code `61010`, section `61000` (כיבוד) as proposed.
4. **60010 "ספקים — כללי" split**: **approved**, resolves the old-code-5000
   conflict (recognized `עסק/ספקים` vs. NOT_RECOGNIZED `שונות/שונות`). The
   NOT_RECOGNIZED parent card (`60000`) is renamed **`הוצאות לא מוכרות`**
   (the section itself keeps the broader legacy label `הוצאות בלתי מזוהות` —
   see §1, §3c).
5. **`רכב ותחבורה` VAT normalized to `66.67`** across all six
   deductible-VAT car-expense cards (60200 parent + 60220/60230/60240/
   60250/60260/60270) — not 67.00 as originally proposed. `60210 ביטוח רכב`
   stays `vat=0` (unaffected, it was never in the conflicting group).
6. **"בית" and "בנקים וכרטיסי אשראי" duplicate categories**: merge into
   their canonical counterparts (25/25 for the תקשורת trio, 100/0 for
   ריבית) — the chart already reflected this (built on the canonical combo
   only, §6.4/§6.7); confirmed as final, not merely a proposal. Delta check
   run against `keepintax_prodcopy`: **zero expenses, zero classification
   rules reference either duplicate category — ₪0.00 impact on every
   report.** Recorded as `docs/redesign/intentional-diffs.md` Correction #2.
   Retiring the duplicate `default_category`/`default_sub_category` rows
   themselves remains Phase 2 scope.

**Accepted as originally proposed, no further action (informational,
carried forward for Phase 2's attention):**

7. Naming bug fix: `chart.seed.ts`'s `60810` uses the live DB's actual name
   `הוצאות שכר`, not the old hardcoded (and never-matching) `'שכר'`.
8. Two rows squatting on old code `5900` that aren't ספרות מקצועית
   (`עסק/הפקדה לקרן השתלמות`, `פנאי וחופשות/ספרות וקריאה`) — no chart
   account created; recommend the same D14-approved פנסיה-pair treatment
   for the קרן השתלמות duplicate; the פנאי וחופשות row already falls under
   D14's PRIVATE list.
9. Five bank/cash-movement rows on old code `6100` (ביט, בין חשבונותי, חיוב
   אשראי חודשי, משיכת מזומן, פייבוקס) — not real expense cards, no account
   created, same treatment as the existing `'העברות ותנועות בחשבון': null`
   category default.
10. `בנק, אשראי ותנועות/פרעון הלוואה` (loan principal) on old code `6200` —
    not a P&L concept, no account created; likely a balance-sheet account
    in Phase 2, out of this session's scope.
11. `דיור והוצאות הבית/גינה`, `/משכנתא`, `/שכירות` (old code 5100, all
    NOT_RECOGNIZED) — redirected to the `60000` catch-all rather than
    becoming `60100` children.

---

## 1. Sections (`accounting_section`) — 16 total, all SYSTEM

**REVISED 2026-07-10: section code = block anchor** (the parent expense/
income account's own code), replacing the old arbitrary `10/20/.../160`
scheme. Still a separate DB namespace from `booking_account.code` per D1 —
the numeric equality is intentional but not a foreign key. Section names
are the broader legacy P&L labels and can differ from an individual card's
own name within the block (e.g. section `60000` = "הוצאות בלתי מזוהות", its
NOT_RECOGNIZED anchor card = "הוצאות לא מוכרות").

| # | Section code (= block anchor) | Name | Type | displayOrder |
|---|---|---|---|---|
| 1 | `40000` | הכנסות | income | 1 |
| 2 | `40010` | הכנסות פטורות | income | 2 |
| 3 | `60100` | הוצאות משרד | expense | 3 |
| 4 | `60200` | רכב ותחבורה | expense | 4 |
| 5 | `60300` | תקשורת | expense | 5 |
| 6 | `60400` | תוכנות ושירותי ענן | expense | 6 |
| 7 | `60500` | שיווק ופרסום | expense | 7 |
| 8 | `60600` | ייעוץ ושירותים מקצועיים | expense | 8 |
| 9 | `60700` | הנהלת חשבונות | expense | 9 |
| 10 | `60800` | שכר | expense | 10 |
| 11 | `60900` | ספרות מקצועית | expense | 11 |
| 12 | `61000` | כיבוד | expense | 12 |
| 13 | `61100` | עמלות ודמי כרטיס | expense | 13 |
| 14 | `60000` | הוצאות בלתי מזוהות | expense | 14 |
| 15 | `61200` | הוצאות מימון | expense | 15 |
| 16 | `61300` | פחת | expense | 16 |

Balance-sheet/technical accounts (1000–2999, 90000-range) have
`sectionId = NULL`, as before.

---

## 2. Numbering formula (revised)

- Balance-sheet/technical `1000–2999`: **unchanged**, per D2.
- Income: `new = old × 10` — unchanged.
- Expense **block anchors** (parent accounts): `new = old + 55000` —
  unchanged (5200→60200 etc.). Anchors are now also their section's code.
- Expense **children**: **jumps of 10 from the anchor** (anchor+10, +20,
  ...), replacing the old `+1/+2/...` offset scheme. Anchors sit 100 apart,
  so a block has room for at most **9** children before colliding with the
  next block's anchor.
- **Name-collision merge rule** (new): a sub-category whose name is
  IDENTICAL to its block's section name merges into the parent card instead
  of getting its own child code. This resolves both the old "6 collisions
  read oddly in a picker" issue AND the numbering overflow in the 60100
  block (10 old children didn't fit in 9 jump-of-10 slots — see §6.1).
- New technical accounts (90000-range): `90100`/`90200`/`90300` (D14,
  confirmed), plus this session's new `90400`.

---

## 3. Full approved chart

### 3a. Balance-sheet / technical — unchanged

Same 9 rows as before (1000, 1100, 1110, 1120, 1200, 2000, 2100, 2400,
2410) — no law fields (not applicable to non-expense accounts).

### 3b. Income — unchanged codes, no law fields

| Old | New | Name | Section |
|---|---|---|---|
| 4000 | **40000** | הכנסות | 40000 |
| 4010 | **40010** | הכנסות פטורות | 40010 |

### 3c. Expense block anchors (= section codes)

| Old | New | Name | vat% | tax% | Recognition | Notes |
|---|---|---|---|---|---|---|
| 5000 | **60000** | הוצאות לא מוכרות | 0 | 0 | NOT_RECOGNIZED | renamed 2026-07-10; section keeps legacy label |
| — | **60010** | ספקים — כללי (הוצאה מוכרת) | 100 | 100 | RECOGNIZED | NEW, approved |
| 5100 | **60100** | הוצאות משרד | 100 | 100 | RECOGNIZED | absorbs old 5103 (name-identical) |
| 5200 | **60200** | רכב ותחבורה | 66.67 | 45 | RECOGNIZED | normalized 2026-07-10 |
| 5300 | **60300** | תקשורת | 25 | 25 | RECOGNIZED | canonical combo; "בית" duplicate merged, Correction #2 |
| 5400 | **60400** | תוכנות ושירותי ענן | 100 | 100 | RECOGNIZED | |
| 5500 | **60500** | שיווק ופרסום | 100 | 100 | RECOGNIZED | absorbs old 5501 (name-identical) |
| 5600 | **60600** | ייעוץ ושירותים מקצועיים | 100 | 100 | RECOGNIZED | |
| 5700 | **60700** | הנהלת חשבונות | 100 | 100 | RECOGNIZED | absorbs old 5701 + live "רואה חשבון" |
| 5800 | **60800** | שכר | 0 | 100 | RECOGNIZED | |
| 5900 | **60900** | ספרות מקצועית | 100 | 100 | RECOGNIZED | absorbs old 5901 (name-identical) |
| 6000 | **61000** | כיבוד | 0 | 80 | RECOGNIZED | absorbs old 6001; tax=80 confirmed |
| — | **61010** | מתנות מוכרות | 0 | 100 | RECOGNIZED | NEW, approved (tax100/vat0) |
| 6100 | **61100** | עמלות ודמי כרטיס | 0 | 100 | RECOGNIZED | parent default |
| 6200 | **61200** | הוצאות מימון | 0 | 100 | RECOGNIZED | parent default; "בנקים וכרטיסי אשראי" duplicate merged, Correction #2 |
| 6300 | **61300** | פחת | 0 | 0 | RECOGNIZED | parent unused directly |

### 3d. Expense children (jumps of 10)

| Old subAccountCode | New | Name | vat% | tax% | red% | eq | Parent |
|---|---|---|---|---|---|---|---|
| 5101 | 60110 | ארנונה | 0 | 25 | — | — | 60100 |
| 5102 | 60120 | גז | 0 | 25 | — | — | 60100 |
| 5104 | 60130 | ועד בית | 0 | 25 | — | — | 60100 |
| 5105 | 60140 | חשמל | 0 | 25 | — | — | 60100 |
| 5106 | 60150 | מים | 0 | 25 | — | — | 60100 |
| 5110 | 60160 | תחזוקה | 0 | 25 | — | — | 60100 |
| 5108 | 60170 | שכירות משרד | 100 | 100 | — | — | 60100 |
| 5109 | 60180 | שליחויות | 100 | 100 | — | — | 60100 |
| 5201 | 60210 | ביטוח רכב | 0 | 45 | — | — | 60200 |
| 5202 | 60220 | דלק | 66.67 | 45 | — | — | 60200 |
| 5203 | 60230 | חניה | 66.67 | 45 | — | — | 60200 |
| 5204 | 60240 | טיפולים | 66.67 | 45 | — | — | 60200 |
| 5205 | 60250 | כבישי אגרה | 66.67 | 45 | — | — | 60200 |
| 5206 | 60260 | מערכות | 66.67 | 45 | — | — | 60200 |
| 5207 | 60270 | תחבורה ציבורית | 66.67 | 45 | — | — | 60200 |
| 5301 | 60310 | אינטרנט | 25 | 25 | — | — | 60300 |
| 5302 | 60320 | טלפון קווי | 25 | 25 | — | — | 60300 |
| 5303 | 60330 | פלאפון | 25 | 25 | — | — | 60300 |
| 5401 | 60410 | תוכנות | 100 | 100 | — | — | 60400 |
| 5601 | 60610 | ייעוץ והשתלמויות | 100 | 100 | — | — | 60600 |
| 5602 | 60620 | ייעוץ מקצועי | 100 | 100 | — | — | 60600 |
| 5801 | 60810 | הוצאות שכר (name fixed, §0.7) | 0 | 100 | — | — | 60800 |
| 6101 | 61110 | עמלות ודמי כרטיס (עסק) | 0 | 100 | — | — | 61100 |
| 6102 | 61120 | עמלות ודמי כרטיס (בנק, אשראי ותנועות) | 0 | 25 | — | — | 61100 |
| 6201 | 61210 | ריבית | 0 | 100 | — | — | 61200 |
| 6301 | 61310 | מחשב | 100 | 0 | 33.33 | ✓ | 61300 |
| 6302 | 61320 | ריהוט | 100 | 0 | 7 | ✓ | 61300 |
| 6303 | 61330 | רכב | 0 | 0 | 15 | ✓ | 61300 |

No children (merged into parent): **60500, 60700, 60900, 61000**.

### 3e. New technical accounts (90000-range)

**Updated 2026-07-14** — added `90500`/`90600` (Phase 2.2, already committed
to `chart.seed.ts`/`docs/redesign/phase2-catalog-review.md` but never added
to this table) and two new columns: `recognitionType` and `reportScope`.
Before this addendum both were implicit — a technical account's exclusion
from the P&L relied only on `sectionId = NULL` dropping it out of
`createPnLReportFromJournal`'s `INNER JOIN accounting_section`, and
`recognitionType` was simply `NULL` (the generic "not applicable to a
non-expense account" convention `code6111` also uses). Now both are
explicit: `recognitionType = NOT_APPLICABLE` (not `NOT_RECOGNIZED` — these
aren't disallowed business expenses like קנסות, they're not business
expenses at all, and conflating the two would wrongly lump them into any
future "unrecognized expenses" report) and `reportScope = TECHNICAL`, which
`createPnLReportFromJournal` now also filters on directly as a second,
defense-in-depth guard alongside the `sectionId` join.

| Code | Name | Type | Recognition | Report scope | Notes |
|---|---|---|---|---|---|
| 90100 | מקדמות מס הכנסה | asset | NOT_APPLICABLE | TECHNICAL | D14, confirmed |
| 90200 | גביית מע"מ | asset | NOT_APPLICABLE | TECHNICAL | D14, confirmed VAT-remittance clearing |
| 90300 | מקדמות ביטוח לאומי | asset | NOT_APPLICABLE | TECHNICAL | D14, confirmed |
| 90400 | מס במקור שנוכה מלקוחות | asset | NOT_APPLICABLE | TECHNICAL | withholding tax clients deducted at source |
| 90500 | תנועות פנימיות בין חשבונות | asset | NOT_APPLICABLE | TECHNICAL | Phase 2.2 (cutover.sql Section 3/4b, not yet cut over to real production) — internal transfers (ביט/בין חשבונותי/חיוב אשראי חודשי/משיכת מזומן/פייבוקס), see `phase2-catalog-review.md` |
| 90600 | פרעון הלוואות (קרן) | liability | NOT_APPLICABLE | TECHNICAL | Phase 2.2 — loan principal repayment; account `1000` checked and rejected as a target (vestigial, never-posted-to placeholder) |

### 3f. ANNUAL cards (model change, 2026-07-14)

**NEW section.** Real `booking_account` rows for the five D14 group-2
sub_categories that previously carried `accountId = NULL` with a
`sub_category`-level `reportScope = ANNUAL` marker (that marker is now
retired — `reportScope` lives only on the card). `sectionId = NULL` (never
rolls up into any P&L חתך; `reportScope = ANNUAL` is belt-and-braces
exclusion even if a `sectionId` were ever mistakenly set). Zero law
(`0/0/0`) — these are personal-deduction items routed to the annual report,
not business P&L expenses, but still get full double-entry treatment when
journaled (D1: the card carries the law even when that law is "excluded
from P&L"). `recognitionType = NOT_APPLICABLE`, not `NOT_RECOGNIZED` — same
reasoning as §3e: these aren't disallowed business expenses, they're
personal tax-credit items entirely outside the business P&L. Codes
allocated sequentially from the SYSTEM expense range's ceiling at the time
(`61330`, `פחת/רכב`) — the same jumps-of-10 mechanism
`AccountCodeAllocatorService` would produce.

| Code | Name | vat% | tax% | red% | eq | Recognition | Report scope |
|---|---|---|---|---|---|---|---|
| 61340 | תרומות מוכרות | 0 | 0 | 0 | — | NOT_APPLICABLE | ANNUAL |
| 61350 | ביטוח חיים | 0 | 0 | 0 | — | NOT_APPLICABLE | ANNUAL |
| 61360 | ביטוח אובדן כושר עבודה | 0 | 0 | 0 | — | NOT_APPLICABLE | ANNUAL |
| 61370 | הפקדה לפנסיה | 0 | 0 | 0 | — | NOT_APPLICABLE | ANNUAL |
| 61380 | הפקדה לקרן השתלמות | 0 | 0 | 0 | — | NOT_APPLICABLE | ANNUAL |

---

## 4. `account_code_migration` — 50 rows (16 accountCode + 34 subAccountCode)

Same total row count as before (50), same set of old codes covered. What
changed: 6 of the 34 old subAccountCodes now migrate to their BLOCK'S
PARENT code instead of a distinct child code (the name-collision merges +
the 5107 redirect), and every other child's new code changed to the
jumps-of-10 scheme. Full list is in `chart.seed.ts` (`CHART_ACCOUNTS`-derived
rows + `MERGED_SUBACCOUNT_MIGRATIONS`); not duplicated here to avoid drift
between the code and this doc — see the file directly, `ACCOUNT_CODE_MIGRATION`
export, verified by script to have exactly 50 rows with zero duplicate old
codes and every new-code target resolving to a real chart-account row.

Special case (unchanged): business 204245724's six journal_line rows on old
account 5000, Bituach Leumi counterparty → remap to `90300`, not
`60000`/`60010` (D14/D15, handled as a targeted UPDATE in 1.4).

---

## 5. Entity change (`BookingAccount`, D1.2 revised)

Added to `booking_account`, per revised D1/D5 ("the card carries the full
accounting law"):

```
vatPercent: decimal(5,2) | null
taxPercent: decimal(5,2) | null
reductionPercent: decimal(5,2) | null
isEquipment: boolean | null
recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | null
```

All five are **nullable** — NULL on every non-expense account (income,
balance-sheet, technical), same "NULL = not applicable" convention already
used for `code6111`. New enum `RecognitionType` added to `src/enum.ts`.

**Updated 2026-07-14:**

```
recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'NOT_APPLICABLE' | null
reportScope: 'pnl' | 'annual' | 'technical'   -- NOT NULL, default 'pnl'
```

- `RecognitionType.NOT_APPLICABLE` (third enum value): for cards that are
  not business expenses at all — the 90000-range technical accounts (§3e)
  and the ANNUAL personal-deduction cards (§3f) — as distinct from
  `NOT_RECOGNIZED`, which means "a real business expense the tax authority
  disallows" (e.g. `60000`/קנסות-type rows). `NULL` remains reserved for
  TRUE non-expense accounts where the concept doesn't apply structurally
  (income, balance-sheet) — not a synonym for `NOT_APPLICABLE`.
- `reportScope` moved from `sub_category` onto `booking_account` (same "law
  lives on the card, not the pointer" principle as every other law field).
  Replaces the old `sub_category`-level ANNUAL marker (a `sub_category`
  with `reportScope=ANNUAL` and `accountId=NULL`, D14 group 2) — that
  bucket is retired; ANNUAL sub_categories now point at a real §3f card
  instead. `TECHNICAL` is a new third value (previously the 90000-range's
  P&L exclusion was implicit via `sectionId=NULL` alone).

---

## 6. Percent-conflict check (task 1.3's "detect and list, don't merge
   silently") — full results

Ran across all 87 live `default_sub_category` rows, grouped by current
`accountCode`. **8 of 13 non-null accountCode groups had more than one
distinct `(tax%, vat%, reduction%, isEquipment, isRecognized)` combination**
— i.e. 8 old codes were carrying more than one real treatment, which the
revised D1 model ("different percent combo = different card") can no longer
represent with a single account. Resolution taken for each, below.

### 6.1 — old code `5100` (הוצאות משרד) — 3 combos, 12 rows

| Combo | Rows |
|---|---|
| tax25/vat0, recognized | ארנונה, גז, ועד בית, חשמל, מים, תחזוקה |
| tax100/vat100, recognized | הוצאות משרד (name-collision→merged into parent), שכירות משרד, שליחויות |
| tax0/vat0, NOT recognized | גינה, משכנתא, שכירות |

**Resolution**: combo 1 → 6 children (60110–60160). Combo 2's "הוצאות משרד"
merges into parent per the name-collision rule; שכירות משרד/שליחויות get
their own children (60170/60180) despite sharing the parent's combo, to
preserve sub-ledger granularity like the pre-existing design. Combo 3 (all
three NOT recognized) → redirected to the `60000` catch-all (§0.11).

### 6.2 — old code `5000` (הוצאות בלתי מזוהות) — 3 combos, 3 rows — RESOLVED

| Combo | Row |
|---|---|
| tax52/vat0, recognized, ANNUAL | עסק/מקדמות ביטוח לאומי |
| tax100/vat100, recognized | עסק/ספקים |
| tax0/vat0, NOT recognized | שונות/שונות |

Row 1 is the D14/D15-registered Bituach Leumi case — remaps to `90300`, not
this block at all. Row 3 defines the `60000` catch-all, renamed
**הוצאות לא מוכרות** (NOT_RECOGNIZED, 0/0). Row 2 gets the approved `60010`
child (§0.4).

### 6.3 — old code `5200` (רכב ותחבורה) — RESOLVED

ביטוח רכב is intentionally vat0 (insurance, no VAT input). The other six all
carry tax45; the old vat split (67.00 on five rows, 66.66 on מערכות alone)
is **normalized to 66.67 across all six** (§0.5).

### 6.4 — old code `5300` (תקשורת) — RESOLVED, Correction #2

Canonical `דיור והוצאות הבית` rows (אינטרנט/טלפון קווי/פלאפון) at 25/25 vs.
the documented-dead duplicate category `בית`'s same-named rows at 100/100.
Children built on the canonical combo; the "בית" duplicate merges into it
per §0.6 — zero live usage, zero report delta (`intentional-diffs.md`
Correction #2).

### 6.5 — old code `5900` (ספרות מקצועית) — 2 combos, 4 rows

| Combo | Row |
|---|---|
| tax100/vat100, recognized | עסק/ספרות מקצועית (→ merges into parent, name-identical) |
| tax0/vat0, NOT recognized | עסק/הפקדה לקרן השתלמות; פנאי וחופשות/ספרות וקריאה; החזרי מס/הפקדה לקרן השתלמות (עצמאי) |

Only the first row is a real ספרות מקצועית card (merges into `60900`). The
other three are anomalies (§0.8) — no chart account; Phase 2 concern.

### 6.6 — old code `6100` (עמלות ודמי כרטיס) — 3 combos, 7 rows

Two real cards (עסק 100/0, בנק 25/0) → 61110/61120. Five NOT_RECOGNIZED
bank/cash-movement rows (§0.9) — not real expense cards, no account created.

### 6.7 — old code `6200` (הוצאות מימון) — RESOLVED, Correction #2

Real card: `בנק, אשראי ותנועות/ריבית` (100/0) → `61210`. Documented-dead
duplicate category `בנקים וכרטיסי אשראי/ריבית` (100/**100**) merges into it
per §0.6 — zero live usage, zero report delta. `פרעון הלוואה` (§0.10, loan
principal) is a balance-sheet concept, no account created.

### 6.8 — old code `4000` (income) — informational only, not a real conflict

7 income rows all show `tax=0/vat=0`, differing only in `isRecognized`
(cosmetic — income doesn't carry deductibility percents the way expenses
do). All map to the single `40000` parent as before; not treated as a D1
percent conflict.

### Groups with NO conflict (single combo, straightforward)

Old codes `5400`, `5500`, `5600`, `5700`, `6000` — one distinct combo each
across all their rows, no action needed beyond the name-collision merges
already noted in §3c/§3d.

---

## 7. Status

All four this-session decisions applied to `chart.seed.ts` and verified
(59 accounts, 16 sections, 50 migration rows, zero duplicate/colliding
codes, `tsc --noEmit` clean). Committing 1.2 + 1.3 together. Next: Session 4
(task 1.4, the actual renumbering script).

**2026-07-14 addendum status**: `chart.seed.ts` now carries **66 accounts**
(the original 59 + `90500`/`90600` from Phase 2.2 — already committed to
`chart.seed.ts`/`cutover.sql` per `phase2-catalog-review.md`, but not yet in
real production pending the still-unexecuted cutover — plus the 5 new §3f
ANNUAL cards) — 16 sections and 50 migration rows unchanged (every new row
in this
addendum has `legacyCode: null`, so none of them touch
`ACCOUNT_CODE_MIGRATION`). This doc was out of sync with `chart.seed.ts`
until this update — §3e/§3f/§5 above are now the source-of-truth transcript
for review; no further action needed on `chart.seed.ts` itself.
