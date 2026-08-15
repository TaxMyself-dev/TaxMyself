# Form 6111 category/sub-category backfill — Step 0 diagnosis + Step 3 blocker

Date: 2026-08-14
Scope: read-only investigation — no schema, code, or data changed. Ran
against `keepintax-dev` directly with `SELECT` only.

Written in response to a request to add official Tax Authority category +
sub-category names (`category6111`/`subCategory6111`) to every
`booking_account` row (both the 68 operational rows and the 321 Form 6111
reference rows), sourced from `tax_authority_6111_full.csv`.

## Step 0 finding: there is no display bug

The request's Step 0 asked to diagnose why `code6111` shows blank in the
admin catalog table for the 68 operational rows, on the assumption that
those rows already have `code6111` populated in the DB ("verified in
earlier phases") and that the value is being dropped somewhere between the
backend and the UI.

That assumption doesn't hold. Both layers are already correctly wired:

- Backend: `listAccountsForAdmin` returns `code6111: r.code6111` —
  `backend/src/bookkeeping/catalog.service.ts:1113`.
- Frontend: `IBookingAccountRow.code6111` exists, and
  `booking-account-catalog.component.html` renders
  `{{ row.code6111 || '—' }}`.

Verified directly against the live DB rather than trusting the code
reading alone:

```sql
SELECT code, name, code6111 FROM booking_account
WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL
ORDER BY CAST(code AS UNSIGNED) LIMIT 10;
-- 0 rows

SELECT COUNT(*) FROM booking_account
WHERE chartOwnerKey='SYSTEM' AND code NOT LIKE '6111-%' AND code6111 IS NOT NULL;
-- 0
```

**Zero operational rows have a non-null `code6111`.** Nothing is being
dropped between backend and frontend — there is simply nothing there to
display.

This matches two independent pieces of evidence already in the repo:

- `chart.seed.ts` hardcodes `code6111: null` on every operational row, with
  an explicit comment: *"NULL everywhere — see file header. Do not invent
  values."*
- `docs/redesign/form-6111-code-audit.md` (written 2026-08-10, before the
  reference-card import project existed) independently reached the exact
  same conclusion: *"`code6111` is uniformly NULL across all 70 accounts...
  The export column is fully wired and will populate automatically the
  moment `code6111` is backfilled — no frontend/backend change needed, only
  data."*

## Step 3 is blocked on a real, unaccounted-for prerequisite

Sanity-checked the CSV itself against the request's own example and stated
edge cases — the CSV data is solid:

```
$ grep "^A,3566," tax_authority_6111_full.csv
A,3566,הוצאות הנהלה וכלליות,אחזקת רכב והובלות (ללא דלק),6111-3566

$ grep ",183," tax_authority_6111_full.csv
B,183,התאמות נדרשות לצרכי מס (הוסף/הפחת),הוצאות בגין תרומות,6111-183

$ awk -F',' '{print $2}' tax_authority_6111_full.csv | sort | uniq -d
2570
```

- `6111-3566` → category `הוצאות הנהלה וכלליות`, subcategory `אחזקת רכב
  והובלות (ללא דלק)` — matches the request's own worked example.
- `183` → a real Part B entry (`התאמות נדרשות לצרכי מס`, `הוצאות בגין
  תרומות`) — would resolve correctly for account 61340 (תרומות מוכרות) if
  its `code6111` were populated with `183`.
- `2570` is confirmed as the **only** duplicated code in the CSV, exactly
  as flagged in the request (once as expense `6111-2570-1`, once as income
  `6111-2570-2`).

But Step 3 as specified can't run at all right now: it processes *"each
operational row... that has a non-null `code6111`"* — and per the DB check
above, **zero operational rows satisfy that condition**. This isn't a
subset being missed; the entire trigger is never true.

There is a step missing between "Step 0" and "Step 3" that wasn't in the
original plan: **something has to populate `code6111` itself on the 68
operational rows first.** The worked example given (60210/60230/60240/
60250/60260 → 3566) is exactly that mapping — but it doesn't exist
anywhere in the codebase or the DB yet.

I deliberately did not construct that 68-row mapping myself by
fuzzy-matching operational account names against the CSV's
category/subcategory text. That would violate the "never invent a value"
convention this project draws everywhere else around `code6111`/official
6111 identity (the entity comment, `chart.seed.ts`'s own comment, the
2026-08-10 audit doc). Getting a Tax Authority classification wrong is a
real correctness risk, not a cosmetic one.

## Open question

Is there an existing source for the full operational-account → `code6111`
mapping (something already worked out elsewhere, e.g. in
`docs/redesign/phase1-chart-review.md` or a list not yet in the repo), or
does this need to be derived from scratch before Step 3 can proceed?

Steps 1 (schema: `category6111`/`subCategory6111` columns) and 2
(reference-row backfill from the CSV, keyed on `code` = CSV `internalCode`)
are fully unblocked and unambiguous — they don't depend on this open
question and can proceed independently once confirmed.
