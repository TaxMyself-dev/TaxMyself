# Effective subcategory classification

Classification rules and unapproved bank transactions use the business's effective
subcategory: CLIENT > active delegated ACCOUNTANT > SYSTEM. The accounting law
comes from that subcategory's booking account. Rule/slim/cache percentage columns
are a read model, not a second independent definition of the classification.

The classification identity is the visible category/subcategory name pair. Parent
category IDs may differ between ownership layers; a personal parent does not hide
other default children under the same name. Equal subcategory names under different
category names remain distinct visible classifications.

## Catalog updates and existing data

Creating, saving, or repointing a subcategory refreshes matching rules and pending
slim/cache classifications in the catalog write transaction. Updating account law
and creating an account with a paired subcategory use the same reconciliation.
Both RULE and ONE_TIME pending classifications follow current subcategory law.
Period, source provenance, merchant, amount and rule conditions are preserved.

Resolution is scoped by the transaction business, with the permanent bill as the
fallback for legacy NULL business attribution. Only ACTIVE delegations contribute
accountant rows. Rule business attribution wins over its bill's default. One
business's personal override never becomes another business's definition.

Existing stale read models are reconciled before ordinary cashflow listing,
ingestion, review-screen preview and legacy transaction approval. New imports
resolve rule names against the effective catalog, with one lookup per business and
classification in the batch. Bank expense creation resolves again at approval and
does not treat client-supplied cached percentages as one-off accounting overrides.
Agent read-only review previews continue to perform no reconciliation writes.

No schema migration, production SQL execution or boot-time backfill is required.
Existing stale rows are repaired on the next relevant normal read or catalog write.

## Approval boundary

- Automatic catalog refresh excludes confirmed or locked transactions, and
  independently protects linked approved/reported expenses. Cache refresh also
  checks the durable slim state so inconsistent legacy flags cannot unfreeze it.
- Rule backfill and rule-edit propagation exclude approved rows. Backfill insert
  uses INSERT IGNORE and updates check pending/unlocked state at write time.
- Authorized manual editing of an approved but unsubmitted transaction remains
  available through the existing manual path and its expense/journal sync.
- Agent classification rejects confirmed slim/cache rows and linked approved or
  reported expenses before preflight, in both one-time and permanent modes.
- Reported-period locks still apply to manual users and agents.

Approved snapshots and journal history are never rewritten by catalog reconciliation.
Explicit expense mapping overrides and generic manual expense-entry behavior are
unchanged; this change concerns bank transaction classification and approval.

## Verification and manual check

Regression tests cover equal names under different parent IDs, tenant isolation,
new rule matches using personal law, pending manual picks, generated MySQL column
mapping and approval guards, stale bank inputs, read-only agent previews, and
manual-versus-agent approved-transaction boundaries.

Before integration, manually create a personal fuel subcategory with different
percentages, verify an existing pending RULE and ONE_TIME transaction both change,
verify an approved transaction does not change, import another matching transaction,
and confirm manual editing of the unsubmitted approved transaction remains possible
while an agent attempt is rejected. Check the same label in another business too.

Automated SQL verification builds real TypeORM MySQL metadata without connecting to
a live database. It does not replace a live MySQL/concurrency or browser E2E check.
