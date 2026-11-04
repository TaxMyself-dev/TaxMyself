# Direct-card imports and opt-in bank exclusion

Direct/Debit cards are imported through the card feed like credit cards. Existing
card-kind/readiness verification and ordinary consent, failure and retry reporting
remain in force. A failed pull never changes the cashflow preference. There is no
automatic bank/card matching, including for grouped bank debits.

## Stored data and policy

- `user.excludeDirectCardBankTransactionsFromCashflow`: boolean, false by default.
- `user.directCardNoticeDismissed`: boolean, false by default; suppresses only the
  explanatory popup, independently of the cashflow exclusion preference.
- `sub_category.systemKey`: nullable unique catalog identity. The SYSTEM/private
  `בנק, אשראי ותנועות / כרטיס דיירקט` row has `DIRECT_CARD_BANK_PAYMENT`. It has no accounting
  account and cannot be edited, removed, remapped or replaced by a client override.
  This operational label is for bank payment mirrors, not merchant expenses.
- `slim_transactions.sub_category_id` and `classified_transactions.subCategoryId`
  already exist. Classification now validates and carries selected IDs through
  manual/rule writes, backfill, rule edits and cache reconstruction.
- `full_transactions_cache.sub_category_id` mirrors the selected identity.
- `slim_transactions.sourceRecordId` retains source provenance after cache cleanup.
  Classification rules keep their existing bill-wide scope: billId, merchant name
  and optional conditions. Rules do not store or filter by sourceRecordId; matching
  and backfill can span multiple sources associated with the same bill.

`cashflow-exclusion.ts` holds one correlated SQL predicate: opt-in preference AND
owned BANK_ACCOUNT source AND the identified SYSTEM subcategory. Cache reads use
the durable slim classification when present. Missing provenance stays visible.
Names, merchant text and POSD are never exclusion criteria.

The predicate applies to the cashflow list, monthly/category graphs, merchant
options, pending approval lists/archive, report preview checks and direct approval
guards. `includeExcluded=true` on the transaction list bypasses only its display
filter and returns `excludedFromCashflow`; it never bypasses approval guards or
changes totals. Existing approved Expenses, documents and journals remain intact.
Opting out or reclassifying the bank row immediately restores its visibility.

## Interface

Settings → My Categories provides a server-backed preference, independent of the
selected business. Owner writes use `/transactions/cashflow-preferences` (GET/PATCH,
Firebase authentication); represented-client writes are forbidden. The checkbox
rolls back on failed persistence and prevents overlapping saves.

The setting is offered only when the server has an owned CREDIT_CARD source with
isDirect=true; unknown card types and merchant descriptions do not qualify.
The dashboard offers an explanatory popup when this detection is present, the
exclusion preference is off and the permanent notice-dismissal flag is false.
The popup saves the same checkbox through the same preference endpoint. It waits
for banking sync/dialogs to finish and is disabled in represented-client mode.
X, Close and Remind Later defer until the next real login: a per-UID browser marker
records the existing server lastLoginAt, so page reload/navigation does not count
as a new login. Browser-storage restrictions fall back to in-memory suppression.
Never Show Again calls the owner-only PATCH /transactions/direct-card-notice,
which persists only directCardNoticeDismissed=true. Settings remains available.
There is no new reminder-date column. The server's lastLoginAt records real logins,
not navigation. Temporary suppression is local to the browser; permanent suppression
applies across devices.

Users classify a bank row into the SYSTEM label and create a permanent rule using
their bank's description. The cashflow page can show excluded rows, marked in the
name column, for inspection and reclassification. Known Direct cards offer normal
manual pulls. Consent state is rendered independently of card kind.

Successful preference writes emit a shared invalidation event. Cached cashflow
lists and valid chart forms refetch their data; failed writes do not invalidate
them and restore the previous checkbox value. The backend updates only the
preference column, avoiding replay of stale connection/profile state.

Pulling Direct cards can show duplicate bank/card expenses until users classify
bank mirrors and opt in. This is intentional opt-in behavior. Completeness of the
card feed is not inferred from a successful sync; users must connect the card and
check the applicable period. Historical bank approvals are not automatically
transferred to card IDs; previously approved duplicates need separate review.

## Manual database preparation

Apply [direct-card-cashflow.sql](direct-card-cashflow.sql) to the selected non-production
database before launching this version. The same script is appended to
`docs/redesign/cutover.sql` for the repository's manual release process. It adds
columns/index, seeds the stable label, backfills only existing IDs/provenance and
resets legacy `skipped_direct` card outcomes to `not_synced`. It never opts existing
users in or deletes financial records. The script is rerunnable and refuses an
unmarked pre-existing same-name SYSTEM label instead of repurposing it.

The approved SQL was applied twice successfully to keepintax-dev, including the
notice flag and corrected parent category, with unchanged user/transaction/rule
counts. No provider request or production operation was executed. Live UI/provider
verification remains a manual check before release. Do not run the whole Nest app against production-copy
data with schema synchronize or boot seeding enabled.

## Demo and verification

The Direct-card demo is synthetic-only. Normal seed/reset and the fixed-state
action create card detail, classify bank mirrors into the system label and enable
the preference. Its legacy action disables the preference and shows both feeds.
Both source sync statuses are success; no Feezback call is made.

Focused tests cover SQL policy against a local in-memory SQLite fixture (Node
22.13+ or 24), unchanged bill-wide rule scope and cache rebuild, owner/boolean validation, Direct
imports/retries and preservation of readiness checks, archive approval and catalog
idempotency. SQLite checks do not substitute for MySQL deployment rehearsal.
Frontend focused tests use `tsconfig.direct-card.spec.json` and
`karma.direct-card.conf.js` on port 9889. Production builds also validate the UI.

No GitHub push is authorized until Elazar personally verifies the current local
main revision and explicitly approves pushing it.
