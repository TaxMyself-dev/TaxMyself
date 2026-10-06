# KT-042 — Refresh billing branch from origin/main before schema rehearsal

- Status: Refresh verified; local merge commit ready, database rehearsal pending target
- Owner: Codex task manager
- Worktree: C:/Users/user/.codex/worktrees/billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Pre-merge HEAD: 2f7b8ffd
- Fetched origin/main: 61080d14fe33c58a203cecabb30671449f008b66
- Authorization: Elazar approved fetching, merging origin/main into this
  isolated billing branch and resolving conflicts on 2026-10-06. No push,
  main/NEW-AI-CHAT changes, live-provider actions or deployment.

## Conflict resolutions

Nine files conflicted. Eight code/documentation files were resolved manually:
subscription imports, admin service and tests, billing service and tests,
access service, admin subscription UI and its topic document. Both upstream
complimentary-access controls and local canonical debt/payment flows remain.
PAST_DUE blocking stays immediate for standard subscriptions; complimentary
access still bypasses payment requirements. Two upstream test fixtures were
adapted for canonical actor arguments and added subscription fields.

Semantic integration checks exposed complimentary guards confined to the
legacy renewal path. Added corresponding canonical preflight/locked-gate,
collection reservation and provider-free accrual exclusions. Existing debts
are preserved. Added three regression tests; no provider contract changed.

## Approved SQL resolution

Elazar explicitly approved the exact union in the next turn on 2026-10-06.
Kept origin/main Sections 17 (complimentary mode/event enum) and 18 (pending
transaction archive) verbatim; appended the billing branch's foundation and
collection sections as Sections 19 and 20 respectively, changing only section
labels and dependency references. Compared all executable SQL after stripping
comments/whitespace against the two original conflict sides in approved order:
identical. No SQL statement/body change was made.
Upstream billing_event enum includes all current BillingEventType values.
Do not run the full historical cutover script against an existing database.
The rehearsal needs a specifically approved non-production target and schema
inventory before deciding which already-applied sections to skip.

Automatic approval review rejected a bulk nine-file resolution and then the
single-file SQL union because schema section ordering needs manual review.
The eight other files were resolved in separate small patches. User approval
for the exact SQL union was granted, and that exact patch then passed review.

## Verification

- 25 focused backend suites / 331 tests passed, including debt document lines,
  checkout, cancellation, immediate access blocking, exemptions and renewal.
- Angular production build passed with existing budget/CommonJS warnings.
- Both initial and final backend builds passed after semantic fixes.
- Frontend recovery rerun passed 5/5; sandbox cache writes required narrow
  escalation after EPERM. No shared node_modules or lockfile changes.
- All nine conflicts resolved; git diff --check passed. No DB was contacted,
  no provider request was made and no schema was executed.
- Database execution remains pending a specifically approved test database;
  the user was asked for its name and whether it is isolated/shared.
