# Phase 1.1–1.3 review — new chart of accounts

Status: DRAFT — awaiting Elazar's corrections. Nothing in `backend/src/` has
been written yet; this document is the review artifact requested by the
Session 2 runbook prompt ("present the full proposed chart... BEFORE writing
the seed").

Source data: `backend/src/bookkeeping/account.seed.ts` (16 accounts),
`account-seed.service.ts` (`SUBCATEGORY_SUB_ACCOUNT_CODES`, 34 dev-only
sub-ledger codes), D14/D15 in the master plan, `production-baseline.md`.

---

## 0. Open items — please resolve these first, they gate everything below

**Resolved 2026-07-10 (this session):**
- code6111: Elazar will provide the official Form 6111 code list in a later
  session. Proceeding now with `code6111 = NULL` on every account; nothing
  blocks on this. Revisit once the list is available.
- `90200 גביית מע"מ` confirmed as the VAT-remittance clearing account
  (the actual periodic payment to the Tax Authority), distinct from the
  transactional `2400`/`2410` accounts. Proceeding with this reading and
  the proposed code.

1. **Master plan says sections come from "the current 18 P&L categories."**
   A dedicated search (reports.service.ts, expenses.service.ts, frontend,
   categories-audit.md) found exactly **16** distinct `pnlCategory` strings
   in current code/data, not 18 — see §1. Five more strings exist only as
   dead legacy aliases in `account-seed.service.ts` (`תקשורת ותוכנות`,
   `ייעוץ מקצועי`, `הוצאות חשבונאות`, `עמלות ומימון`, `ספקים`), all of which
   already route to one of the 16 canonical accounts and none of which is
   written by current code except `תקשורת ותוכנות` (which the keyword step
   immediately overrides to 5400 anyway). **Proposal: proceed with 16
   sections** (below); flagging the "18" as a stale figure rather than
   guessing at 2 more you might have in mind. Tell me if you intended 2
   specific additional sections.

2. **`code6111` — I have no verified source for the official Form 6111
   field-code catalog.** Per D2/1.3 ("do NOT invent codes"), every
   `code6111` below is `NULL — TODO`. I did not fill in even
   low-risk-looking guesses (e.g. for `הכנסות`) because I cannot verify them
   against the actual Tax Authority uniform classification and a wrong code
   here has real compliance consequences. **I need either the official
   code list (a document/link) or your own knowledge of the mapping** to
   fill these in — I can't respond to correction unless you tell me the
   values.

3. **The three new D14/decision-3 technical accounts (מקדמות מס הכנסה,
   גביית מע"מ, מקדמות ביטוח לאומי) never existed as accounts before** — I
   proposed codes 90100/90200/90300 (§4) and a reading of "גביית מע"מ" as
   the VAT-remittance clearing account (distinct from the existing
   2400/2410 transactional VAT accounts) — please confirm that reading and
   the codes.

4. **Six sub-ledger accounts share their exact name with their parent
   account** (e.g. parent `60100 הוצאות משרד` / child `60103 הוצאות משרד`,
   from `default_sub_category` row `עסק/הוצאות משרד`). Harmless (only
   `code` is unique, not `name`), but confusing in a picker UI. Proposed
   rename to distinguish (e.g. "הוצאות משרד — כללי"), see §3 footnote —
   confirm or override each one.

5. **Section code scheme** (§2) is my own invention — there is no external
   compliance constraint on it (only `booking_account.code` maps to real
   money/6111, sections are our own P&L grouping layer). Proposed:
   `displayOrder × 10` as a string. Change if you want something else.

---

## 1. Sections (`accounting_section`) — 16 total, all SYSTEM

| # | Proposed code | Name | Type | Old pnlCategory (verbatim) | Old displayOrder |
|---|---|---|---|---|---|
| 1 | `10` | הכנסות | income | הכנסות | 1 |
| 2 | `20` | הכנסות פטורות | income | הכנסות פטורות | 2 |
| 3 | `30` | הוצאות משרד | expense | הוצאות משרד | 3 |
| 4 | `40` | רכב ותחבורה | expense | רכב ותחבורה | 4 |
| 5 | `50` | תקשורת | expense | תקשורת | 5 |
| 6 | `60` | תוכנות ושירותי ענן | expense | תוכנות ושירותי ענן | 6 |
| 7 | `70` | שיווק ופרסום | expense | שיווק ופרסום | 7 |
| 8 | `80` | ייעוץ ושירותים מקצועיים | expense | ייעוץ ושירותים מקצועיים | 8 |
| 9 | `90` | הנהלת חשבונות | expense | הנהלת חשבונות | 9 |
| 10 | `100` | שכר | expense | שכר | 10 |
| 11 | `110` | ספרות מקצועית | expense | ספרות מקצועית | 11 |
| 12 | `120` | כיבוד | expense | כיבוד | 12 |
| 13 | `130` | עמלות ודמי כרטיס | expense | עמלות ודמי כרטיס | 13 |
| 14 | `140` | הוצאות בלתי מזוהות | expense | הוצאות בלתי מזוהות | 14 |
| 15 | `150` | הוצאות מימון | expense | הוצאות מימון | 15 |
| 16 | `160` | פחת | expense | פחת | 16 |

Note: section codes here are **unrelated** to `booking_account.code` — they
are a separate table/namespace per D1. Balance-sheet/technical accounts
(1000–2999, 90000-range) have `sectionId = NULL`, matching today's
`pnlCategory IS NULL` exclusion from the P&L join.

---

## 2. Numbering formula used below

- Balance-sheet/technical `1000–2999`: **unchanged**, per D2.
- Income: `new = old × 10` (4000→40000, 4010→40010) — literal per D2 text.
- Expense parent accounts `5000–6300`: `new = old + 55000` (5000→60000 …
  6300→61300) — lands exactly in the mandated 60000–69999 system range and
  preserves old ordering/spacing so the mapping is visually obvious.
- Expense sub-ledger accounts (old dev-only `subAccountCode`, 5101–6303):
  same `+55000` formula (5101→60101 … 6303→61303), nesting each child
  directly under its parent's new code (e.g. parent `60200` /
  children `60201–60207`).
- New technical accounts (D14 decision 3, never existed before): proposed
  `90100`, `90200`, `90300` — open item 3 above.
- Ranges for `getNextAccountCode` (task 1.5, consistent with this table):
  SYSTEM income `40000–49999`, SYSTEM expense `60000–69999`, ACCOUNTANT
  `70000–79999`, CLIENT `80000–89999`, technical/adjustment `90000–99999`.

---

## 3. Full proposed chart

### 3a. Balance-sheet / technical — codes unchanged

| Code | Name | Type | Section | code6111 | Prod live? |
|---|---|---|---|---|---|
| 1000 | חשבון מעבר | asset | — | NULL–TODO | no |
| 1100 | בנק | asset | — | NULL–TODO | **yes (85)** |
| 1110 | מזומן | asset | — | NULL–TODO | no |
| 1120 | כרטיס אשראי / סליקה | asset | — | NULL–TODO | no |
| 1200 | לקוחות כלליים | asset | — | NULL–TODO | no |
| 2000 | ספקים כלליים | liability | — | NULL–TODO | no |
| 2100 | כרטיסי אשראי לתשלום | liability | — | NULL–TODO | no |
| 2400 | מע"מ עסקאות | liability | — | NULL–TODO | yes (1, non-expense entries) |
| 2410 | מע"מ תשומות | asset | — | NULL–TODO | **yes (56)** |

### 3b. Income

| Old | New | Name | Section | code6111 | Prod live? |
|---|---|---|---|---|---|
| 4000 | **40000** | הכנסות | הכנסות (10) | NULL–TODO | **yes (38)** |
| 4010 | **40010** | הכנסות פטורות | הכנסות פטורות (20) | NULL–TODO | no |

### 3c. Expense parent accounts

| Old | New | Name | Section | code6111 | Prod live (expense lines) |
|---|---|---|---|---|---|
| 5000 | **60000** | הוצאות בלתי מזוהות (generic fallback) | הוצאות בלתי מזוהות (140) | NULL–TODO | **yes (6)** |
| 5100 | **60100** | הוצאות משרד | הוצאות משרד (30) | NULL–TODO | **yes (11)** |
| 5200 | **60200** | רכב ותחבורה | רכב ותחבורה (40) | NULL–TODO | **yes (29)** |
| 5300 | **60300** | תקשורת | תקשורת (50) | NULL–TODO | **yes (14)** |
| 5400 | **60400** | תוכנות ושירותי ענן | תוכנות ושירותי ענן (60) | NULL–TODO | **yes (3)** |
| 5500 | **60500** | שיווק ופרסום | שיווק ופרסום (70) | NULL–TODO | no |
| 5600 | **60600** | ייעוץ ושירותים מקצועיים | ייעוץ ושירותים מקצועיים (80) | NULL–TODO | **yes (3)** |
| 5700 | **60700** | הנהלת חשבונות | הנהלת חשבונות (90) | NULL–TODO | **yes (1)** |
| 5800 | **60800** | שכר | שכר (100) | NULL–TODO | no |
| 5900 | **60900** | ספרות מקצועית | ספרות מקצועית (110) | NULL–TODO | no |
| 6000 | **61000** | כיבוד | כיבוד (120) | NULL–TODO | no |
| 6100 | **61100** | עמלות ודמי כרטיס | עמלות ודמי כרטיס (130) | NULL–TODO | **yes (18)** |
| 6200 | **61200** | הוצאות מימון | הוצאות מימון (150) | NULL–TODO | no |
| 6300 | **61300** | פחת | פחת (160) | NULL–TODO | no |

(9 live-in-prod parent codes shown in bold — matches D14's "nine live code
values" exactly: the 8 distinct 5xxx/6xxx codes above + 4000.)

### 3d. Expense sub-ledger accounts (dev-only today; becomes real per D1/D2)

All currently dev-only (`subAccountCode`, never in prod — schema-drift.md
Gap 1). Each becomes a real `booking_account` row, child of the parent
listed. None has independent prod journal usage (prod never populated
`subCounterAccountCode` — D14).

| Old subAccountCode | New code | Name | Parent (new) |
|---|---|---|---|
| 5101 | 60101 | ארנונה | 60100 |
| 5102 | 60102 | גז | 60100 |
| 5103 | 60103 | הוצאות משרד ⚠️ (name collision, see open item 4) | 60100 |
| 5104 | 60104 | ועד בית | 60100 |
| 5105 | 60105 | חשמל | 60100 |
| 5106 | 60106 | מים | 60100 |
| 5107 | 60107 | שכירות | 60100 |
| 5108 | 60108 | שכירות משרד | 60100 |
| 5109 | 60109 | שליחויות | 60100 |
| 5110 | 60110 | תחזוקה | 60100 |
| 5201 | 60201 | ביטוח רכב | 60200 |
| 5202 | 60202 | דלק | 60200 |
| 5203 | 60203 | חניה | 60200 |
| 5204 | 60204 | טיפולים | 60200 |
| 5205 | 60205 | כבישי אגרה | 60200 |
| 5206 | 60206 | מערכות | 60200 |
| 5207 | 60207 | תחבורה ציבורית | 60200 |
| 5301 | 60301 | אינטרנט | 60300 |
| 5302 | 60302 | טלפון קווי | 60300 |
| 5303 | 60303 | פלאפון | 60300 |
| 5401 | 60401 | תוכנות | 60400 |
| 5501 | 60501 | שיווק ופרסום ⚠️ (name collision) | 60500 |
| 5601 | 60601 | ייעוץ והשתלמויות | 60600 |
| 5602 | 60602 | ייעוץ מקצועי | 60600 |
| 5701 | 60701 | הנהלת חשבונות ⚠️ (name collision) | 60700 |
| 5801 | 60801 | שכר ⚠️ (name collision) | 60800 |
| 5901 | 60901 | ספרות מקצועית ⚠️ (name collision) | 60900 |
| 6001 | 61001 | כיבוד ⚠️ (name collision) | 61000 |
| 6101 | 61101 | עמלות ודמי כרטיס (מקור: עסק) | 61100 |
| 6102 | 61102 | עמלות ודמי כרטיס (מקור: בנק אשראי ותנועות) | 61100 |
| 6201 | 61201 | ריבית | 61200 |
| 6301 | 61301 | מחשב | 61300 |
| 6302 | 61302 | ריהוט | 61300 |
| 6303 | 61303 | רכב | 61300 |

### 3e. New technical accounts (D14 decision 3 — proposed, not yet confirmed)

| Proposed code | Name | Type | Section | Notes |
|---|---|---|---|---|
| 90100 | מקדמות מס הכנסה | asset (advance payment) | NULL (technical) | New — no current equivalent |
| 90200 | גביית מע"מ | liability/asset (clearing) | NULL (technical) | New — my reading: VAT-remittance clearing, distinct from 2400/2410. Confirm. |
| 90300 | מקדמות ביטוח לאומי | asset (advance payment) | NULL (technical) | New — receives business 204245724's six D15-registered entries currently on `5000` |

---

## 4. `account_code_migration` table (old_code, new_code, source)

Every row below is a candidate INSERT for the Phase 1.4 migration map.
`source` distinguishes the two origin columns per D2's spec.

```
-- source = 'accountCode' (parent accounts, old default_booking_account.code)
('4000','40000','accountCode'),
('4010','40010','accountCode'),
('5000','60000','accountCode'),
('5100','60100','accountCode'),
('5200','60200','accountCode'),
('5300','60300','accountCode'),
('5400','60400','accountCode'),
('5500','60500','accountCode'),
('5600','60600','accountCode'),
('5700','60700','accountCode'),
('5800','60800','accountCode'),
('5900','60900','accountCode'),
('6000','61000','accountCode'),
('6100','61100','accountCode'),
('6200','61200','accountCode'),
('6300','61300','accountCode'),

-- source = 'subAccountCode' (dev-only today; derive-from-if-present per 1.4)
('5101','60101','subAccountCode'), ('5102','60102','subAccountCode'),
('5103','60103','subAccountCode'), ('5104','60104','subAccountCode'),
('5105','60105','subAccountCode'), ('5106','60106','subAccountCode'),
('5107','60107','subAccountCode'), ('5108','60108','subAccountCode'),
('5109','60109','subAccountCode'), ('5110','60110','subAccountCode'),
('5201','60201','subAccountCode'), ('5202','60202','subAccountCode'),
('5203','60203','subAccountCode'), ('5204','60204','subAccountCode'),
('5205','60205','subAccountCode'), ('5206','60206','subAccountCode'),
('5207','60207','subAccountCode'), ('5301','60301','subAccountCode'),
('5302','60302','subAccountCode'), ('5303','60303','subAccountCode'),
('5401','60401','subAccountCode'), ('5501','60501','subAccountCode'),
('5601','60601','subAccountCode'), ('5602','60602','subAccountCode'),
('5701','60701','subAccountCode'), ('5801','60801','subAccountCode'),
('5901','60901','subAccountCode'), ('6001','61001','subAccountCode'),
('6101','61101','subAccountCode'), ('6102','61102','subAccountCode'),
('6201','61201','subAccountCode'), ('6301','61301','subAccountCode'),
('6302','61302','subAccountCode'), ('6303','61303','subAccountCode');

-- NOT migrated (unchanged): 1000, 1100, 1110, 1120, 1200, 2000, 2100, 2400, 2410
-- Special-cased, NOT a straight code-map row (per D14/D15): the six
-- business-204245724 journal_line rows currently on account 5000 whose
-- journal_entry counterparty is Bituach Leumi remap to 90300, not 60000 —
-- handled as a targeted UPDATE in 1.4, not via this generic map.
```

Total: 16 parent + 34 sub-ledger = **50 mapping rows**, covering every code
that currently exists in `account.seed.ts` + `SUBCATEGORY_SUB_ACCOUNT_CODES`.

---

## 5. Next step

Once you've corrected §0's open items (especially the `code6111` values —
I cannot proceed on those without your input) and confirmed/edited the
tables in §1–§4, I'll implement:

- `AccountingSection` entity (table `accounting_section`)
- `BookingAccount` entity (renamed from `DefaultBookingAccount`, extended
  per D1.2)
- `backend/src/bookkeeping/chart.seed.ts` — flat seed data reflecting the
  corrected tables above
- The `account_code_migration` seed rows (for task 1.4's consumption)
