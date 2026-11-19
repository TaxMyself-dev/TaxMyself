# Automatic transaction classification

Implemented on `codex/auto-classification`, based on completed onboarding
`a6471735` (on top of `new-ai-assistant` `c0a37b21`). No main integration, push or production deployment was performed. After
separate explicit approval on 19 November 2026, the standalone schema was applied
and verified on `keepintax-dev` only; worker flags and user consent remain unchanged.

## Behavior

The owner gives one user-wide consent in Settings-new → הסוכן שלי or the
verified post-banking connection dialog. A delegate or admin impersonating
the owner cannot read or change automation settings or start automation.
Opt-in requires active open-banking/module access and at least one owned
business with complete onboarding. Each transaction independently requires
complete personal AND business fields, an owned linked payment source with
a persisted consent pointer, an owned bill and the correct owned business.
Unknown and skipped onboarding answers do not authorize automation.
Explicit not-applicable answers use onboarding's allowed answer state.

Background runs classify outgoing, unclassified, unconfirmed, unlocked
transactions only. A background classification always creates a permanent
merchant/account rule by default, using existing matching/precedence and
effective catalog accounting values. The background path never creates a
one-time classification, replaces an existing rule or a manual decision,
approves an expense, changes accounting law, or writes a journal.
One-time choices remain on the existing individual chat approval card.

Existing matching rules run before model analysis. Legacy rules without a
subcategory ID resolve their exact effective category/subcategory names.
An existing rule attributed to another business becomes a clarification.
New rules are applied to historical eligible transactions in subsequent
bounded worker pages, including dates older than one year; the existing
manual/chat rule-backfill range and behavior remain unchanged.

The model assesses purchase identity, business/private purpose, exact purpose
evidence, suitability of a permanent rule and uncertainties separately.
The server refuses a proposed write unless the evidence is an exact quote
from supplied profile/answer/note data, purpose matches the category's private
flag, permanent scope is supported and no uncertainty is declared. This is a
conservative evidence boundary, not a claim that a language model is infallible.
Any ambiguity leaves a durable question instead of a classification.

Replies are saved to the specific question and queue another analysis; they
are not chat-card approvals. Opening the chat from a question creates a draft
with the business and transaction details, never sends or approves it.

## Load, recovery and concurrency

- A 15-second dispatcher discovers committed bank/cache and association
  changes. No model call executes inside the bank sync or user HTTP request.
- `agent_auto_preferences` persists consent, version, keyset cursor and next
  turn. `agent_auto_items` persists outcomes, questions, replies and retries.
- One dedicated MySQL advisory lock globally serializes workers across backend
  instances; the local busy flag also prevents overlapping timers.
- Each turn handles at most 10 eligible rows and at most 3 sequential model
  calls for one user, then rotates by next-scan time. Existing rules avoid model
  calls. No `OFFSET`, whole-history array or bulk rule backfill is used.
- No arbitrary history cutoff. After reaching the end the durable cursor wraps
  to discover newly linked or newly eligible rows. New bank cache rows are
  discovered automatically. There is currently no estimate of completion time.
- Requests have a 30-second timeout, 1,200-token output cap and 80,000-character
  complete-input cap. Oversized evidence becomes a question; it is not silently
  truncated. Technical failures retry at most three times, 120 seconds apart.
- Before writing, user/cache/slim locks, consent version, current banking/module
  access, onboarding versions, owned source/bill, catalog and merchant rules
  are checked again. Profile and rule rows are locked during final validation.
- Item outcome, rule, slim and cache updates commit or roll back together.
  A repeated worker cannot create a duplicate classification or rule.
- Owner opt-out serializes with classification and blocks subsequent writes.
  It preserves existing classifications/rules, which continue to behave as
  ordinary application rules; the UI explains their permanent scope.
- Nightly cache cleanup retains unclassified outgoing rows for opted-in users
  so a large backlog or unanswered question is not erased before processing.
  Verified banking disconnection cleanup retains its existing behavior.

## UI and notifications

`/settings-new?section=agent` opens הסוכן שלי. It shows the consent switch,
readiness per business, missing fields, unlinked payment sources with the
existing transaction account-association drawer (including adding a new account),
pending count, outcome totals and messages. Each unlinked source has a black
application button; no inline account selector. The drawer retains source ID and
explicit source type, then refreshes readiness after successful association.
New settings rule tables show original creator and latest editor. Transaction
tables show סווג על ידי; historical unknown sources remain unknown.

The shared top navigation bell lists recent unread messages and links to
`/settings-new?section=agent&notice=<owned-id>`. A focused old notice is fetched
with owner scope even when outside the first page. Read status and resolution
are independent. Compound timestamp+ID cursors preserve equal-time notices.
Manual classification resolves an old question on the next worker turn.

The banking offer is mounted only after the existing callback readiness flow
refreshes the server-confirmed owner connection, and after its existing dialog
closes. The query parameter alone does not grant anything. Dismissal is saved
without enabling consent. Users can opt in later from Settings-new.
Public authenticated `/agent/onboarding` and `/agent/chat` reuse the existing
onboarding/chat components; the existing development routes remain available
under their previous environment gate. Backend automation availability still
requires explicit deployment flags and applied schema.

## Source provenance

Rules store nullable `createdBySource` and `updatedBySource`; slim/cache store
nullable `classificationSource` (`USER` or `SYSTEM`). User edits preserve the
original creator and set the latest editor. Imports and cache rebuilds carry
the rule/slim source. A human's one-time selection is USER. A user-created rule
automatically matched by the normal pipeline retains USER as its decision
source. NULL means there is no reliable historical origin; no backfill guesses.

## Schema and activation

Review [standalone SQL](../../backend/scripts/migrations/2026-11-19_auto_classification.sql).
It adds two new tables and four nullable provenance columns across three
existing tables. The cumulative cutover file also records this SQL; **do not
run that historic cumulative file to activate this feature**.

The schema must be applied BEFORE running this backend revision, even when the
worker flag is off, because normal TypeORM reads now include provenance columns.
No production schema was applied. The shared-development schema was applied
only after implementation and separate explicit approval on 19 November 2026;
see the task evidence for the metadata checks.
The onboarding schema must already exist. The guarded tool refuses other database
names, checks the actual selected database, allowlists every statement and
validates existing columns rather than blindly recreating them.

After separate approval for the named development target, from the repository:

```powershell
node backend/scripts/auto-classification-schema.cjs --database=keepintax-dev --check
node backend/scripts/auto-classification-schema.cjs --database=keepintax-dev --apply
```

Only after schema verification, use ignored local environment settings:
`AGENT_ONBOARDING_ENABLED=true`, `AGENT_AUTO_CLASSIFICATION_ENABLED=true`, and
the existing `OPENAI_API_KEY`. The model defaults to `gpt-4.1-mini` and can be
selected with `AGENT_AUTO_CLASSIFICATION_MODEL`. Never commit environment files.
Use distinct feature ports (frontend 4316/backend 3016), preserve deployment PORT,
and keep `DISABLE_SYNCHRONIZE=true` and `SKIP_BOOT_SEED=true` in local backend
launch settings. Do not boot against the primary checkout's DB with synchronize.

## Verification

See [task evidence](../tasks/active/assistant-auto-classification.md) for exact
commands, revisions, results, failed diagnostic snapshots and limitations.
MySQL tests accept only an explicit local `auto_classification_test` URL and
never load a real application database or run the app bootstrap. Model diagnostics
send only five synthetic examples, with store:false. Their initial failed fuel
case was retained and caused the separate purpose/evidence/uncertainty contract.

Real Firebase browser login, a real bank redirect and shared-dev activation are
manual deployment checks; synthetic tests do not claim to have performed them.
