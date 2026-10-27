# Primary manager state

## KT-102 native stderr release logging — 2026-10-27

The first quiet-console Apply incorrectly treated gcloud's successful
"browser opened" stderr progress as a terminating Windows PowerShell 5.1 error.
Native stdout/stderr now streams to the detailed log while native failure is
classified exclusively by exit code; stdout-only JSON capture remains isolated.
Nested smoke scripts run through the same boundary in child PowerShell
processes. Fixtures cover stderr+exit 0, stdout with simultaneous stderr, and
exit 7. Release regressions, parser checks and 8 smoke config tests passed.
Delivery `f34bb513` was pushed and verified on local/remote `main`. Codex ran no
production command or deployment.

## KT-101 quiet production release logging — 2026-10-27

The guarded production release now prints only the detailed-log path, stage
START/COMPLETE progress, concise failure/safety/rollback status and final
outcome. Full command, npm, test, build and cloud output streams in real time to
a unique UTF-8 file under git-ignored `deployment-logs/`; successful and failed
runs record a stage summary and full failure record. Fixture-backed quiet-output
and failure-log regression tests, PowerShell parsing and 8 smoke config tests
passed. Delivery `89bbe32d` was pushed and verified on local/remote `main`.
Dependencies were not changed, and Codex performed no production action.

## KT-100 smoke job optional environment repair — 2026-10-27

The first guarded production release reached a healthy zero-traffic candidate
but stopped safely before promotion because the smoke-job configurator read an
optional Cloud Run `valueFrom` property directly under PowerShell strict mode.
Both source-inventory scripts now read optional plain/secret environment fields
and network annotations safely. Fixture coverage reproduces all-plain production
shape plus mixed Secret Manager shape under strict mode. Release regression,
three PowerShell parser checks and all 8 smoke config tests passed. Delivery
`6513b882` was pushed and verified on local/remote `main`. Codex performed no
production access, job update, traffic change or deployment.

## KT-099 backend test baseline repair — 2026-10-27

The backend regression gate exposed by the guarded release attempt was restored
without changing runtime behavior. Ten stale assertions were aligned with the
current document, report, catalog, demo-data and user contracts; two additional
legacy user/auth suites were rewritten against the current APIs. The complete
backend run passed 188 suites and 1,820 tests, followed by a successful Nest
build and `git diff --check`. Delivery `85361511` was pushed and verified on
local `main`, `origin/main` and the remote branch. No schema, production data,
credential, production access or deployment action occurred.

## KT-098 production release orchestrator — 2026-10-26

The guarded PowerShell release orchestrator was locally verified and pushed to
`origin/main` as `1d79885d`. It validates a clean synchronized main branch,
performs interactive gcloud/Firebase login, builds and tests locally, deploys a
zero-traffic backend candidate, binds private smoke jobs to its immutable image,
promotes exact backend/frontend versions, runs signup/login/cleanup smoke, and
attempts rollback after post-promotion failures. Release-script regression
tests, six PowerShell parse checks, eight smoke unit tests, exact-image fixture
validation, and `git diff --check` passed. No production read, deployment,
database access, schema change, credential access, or live smoke run was
performed by Codex; production plan/apply remains an operator action under
`PRODUCTION_POLICY.md`.

## Open banking disconnection source delivery — 2026-10-25

User explicitly authorized final tests, main merge and GitHub push without
production deployment. Initial fetch: primary main5fbbc1ee was20 commits behind
origin/main cb3c70ea, with no local-only commits. User separately approved
preserving non-overlapping untracked checkout items. Clean codex/integration
was fast-forwarded to current remote main, then merged feature4b6e84a2 without
conflicts as46a1868e. Independent review found no blocking findings and confirmed
latest Settings proprietor behavior remains intact.

Integrated validation:24 backend suites/255 tests,89 focused ChromeHeadless
tests, Nest build and Angular production build(hash2b2aa17d34c60540) passed.
No feature schema/SQL/environment/lockfile change. No provider call, database
write, runtime restart, credential/configuration change or production access
occurred during final delivery. Source delivery is separate from deployment.
Feature worktree retained for existing local DEV follow-up. Delivery bookkeeping
is the only change after the tested merge candidate.

## Admin Cardcom refunds source delivery — 2026-10-22

Elazar explicitly authorized merging the refund feature into main and pushing,
excluding deployment and production SQL. Feature was rebased without conflicts
on current origin/main 4dc1306d. The tested code tip 3f5f1163 was fast-forwarded
to primary main and atomically pushed with codex/integration-admin-refunds;
both remote refs were verified with ls-remote. Existing untracked app-mapping
was preserved as authorized. Other integration worktrees were not changed.

Validation: 45 backend suites/556 tests (billing, credit journal, SHAAM), 32
focused frontend regression tests, 9 rollback-only real dev schema checks,
backend and production frontend builds passed. Latest user history preview
additionally passed 10 focused history/cancellation tests and a frontend build.
No executable change followed these checks. Document-only delivery bookkeeping
follows the verified code tip. Feature worktree is retained for pending release
review and dev follow-up.

Refund schema was applied only in dev earlier. Standalone production
preflight/apply/verify SQL and docs/features/admin-refunds-release.md remain
pending owner approval; the apply approval marker is unchanged. New SQL was
reviewed statically, not executed/rehearsed. No production access, provider call,
SQL, runtime/config change or deployment occurred during source delivery.

## KT-085 SHAAM allocation state machine — 2026-10-21

Supplier-side invoice allocation now uses `Invoices/v2/Approval` without the
customer-authorized Invoice Information recovery call. Durable attempt rows,
leases and payload hashes block automatic replay of `PROCESSING` and
`UNKNOWN_OUTCOME`; successful allocations are committed before local
PDF/journal finalization. Admin-only audited resolution supports externally
confirmed non-acceptance or a verified allocation number. Sanitized UI states,
structured non-identifying logs, an admin tab, cutover SQL and a Mermaid flow
document were added. Sixteen focused backend tests, 29 focused frontend tests,
the Nest build and Angular production build passed. Delivery `27b28afe` was
pushed and verified on local/remote `main` and `codex/integration-kt085`.
Section 25 of `docs/redesign/cutover.sql` was subsequently applied to
`keepintax-dev` on 2026-10-21 at Elazar's explicit request. Verification found
all 22 columns, five indexes (including `PRIMARY`) and the `documents` foreign
key. It was not run against production/prodcopy; no live SHAAM call, production
access or deployment occurred.

## KT-084 Shani demo credential update — 2026-10-21

The `partner-candidate-couple` fixture now uses
`shani-demo@keepintax.co.il` / `Shani-demo2026`, with focused assertions for
both exact values. The profile remains REGULAR-only and its roles, permissions,
synthetic banking data, and Feezback protections are unchanged. Integrated code
`8631e4d8` passed the focused Jest profile suite (5 tests) and the Nest build;
local main, `origin/main`, and `codex/integration-kt084` reached that code
commit. No Firebase/DB profile was created or changed, and no schema,
production-data, provider, accounting, authorization, or deployment action
occurred.

## SHAAM sandbox status copy delivery - 2026-10-20

KT-082 distinguishes the expected Tax Authority sandbox business restriction
from genuine connection-status failures in Settings. Real businesses shown
against a tsandbox backend now receive explicit sandbox copy and a disabled
connect action, while unexpected errors retain the generic failure state. Four
focused Angular tests and the production build passed. Code delivery
`54b975a7` was pushed to `origin/main`; no backend guard, schema, accounting,
external contract, production access or deployment changed.

## SHAAM settings and allocation confirmation delivery - 2026-10-20

KT-081 adds per-business Tax Authority invoice-allocation connection status and
an explicit connect/reconnect action under Settings > Permissions and Accounts.
Reconnect deliberately starts a fresh OAuth flow even for an active connection,
allowing newly configured scopes to replace the stored grant. Pending documents
now require confirmation displaying the document number before recovery or
Approval begins. Four focused Angular tests and the production build passed.
Code delivery `9b86283e` was pushed to `origin/main`; no backend, schema,
accounting, external-contract, production-access or deployment change occurred.

## SHAAM safe invoice observability delivery - 2026-10-20

KT-079 replaces identifying invoice-allocation logs with one structured,
searchable outcome event for each SHAAM Approval, confirmation-recovery and
allocation-details call. Events include operation, environment, gateway host,
HTTP status, duration, configuration/result booleans, bounded error category,
strictly validated provider error code and an allowlisted derived reason; they
exclude tokens, payloads, raw provider messages, VAT/customer/business numbers,
invoice/allocation references, dates and amounts. Combined verification passed
all 8 SHAAM suites / 47 tests plus the Nest build. Code delivery `7b386194` was
pushed to `origin/main` and `codex/integration-kt079`; no schema, API contract,
accounting behavior, production access or deployment occurred. Elazar must
deploy the backend revision before retrying the production recovery request.

## Designer demo sandbox delivery — 2026-10-20

KT-078 adds an isolated regular-user designer sandbox created from Admin Panel
> Demo Data. It carries synthetic bank/card data, the only self-reset
capability, full DB-graph restoration while preserving Firebase identity, and
server/client protection from admin/accountant customer areas. Login, manual
sync and source retry cannot call Feezback for this fixture. Combined
verification on refreshed `origin/main` passed 6 backend suites / 21 tests,
Nest build, and Angular production build. The Angular unit-test target remains
blocked by documented unrelated legacy spec/type errors. Delivery includes the
previously approved KT-077 deferred-task document, changes no schema, touches no
production data or provider, and performs no deployment.

## Table actions integration — 2026-10-15

Elazar explicitly requested main delivery of `codex/table-actions` source
`7ac0bcad`. The isolated integration branch `codex/integration-table-actions`
starts from refreshed main `5a9afbd3`. Current pending-only SHAAM recovery/resume
and account-image changes are preserved during conflict resolution. Combined
frontend verification and delivery evidence is recorded in
`docs/tasks/active/table-actions.md`. No backend/schema/production changes.
Code integration `66379184` passed 40/40 focused frontend tests and the full
production Angular build. Atomic push of main/codex-integration succeeded;
remote main and codex/integration were verified at that code commit before
this documentation-only delivery record. No production deployment occurred.

Last reviewed: 2026-10-07

## Integration baseline

- Main baseline incorporated before KT-016 integration: `0bdbfc15`
- Manager branch: `codex/integration`
- Production access: disabled by standing decision.

## Active work

- `KT-009`: Gmail forwarding-verification delivery is on `origin/main`; waiting
  for final user validation before archival.
- `KT-012`: repository Markdown and development-instruction architecture cleanup
  is approved, verified, and delivered through integration commit `8a54f63c`.
- `KT-015`: reports endpoint authorization hardening is verified and delivered
  through integration commit `7b183989`.
- `KT-016`: unified admin catalog tabs and SYSTEM-card creation are verified and
  delivered to `origin/main` through `bb784bae`.
- `KT-017`: admin educational-content pilot with the first three self-employed
  guide slides is verified and delivered to `origin/main` through `5cd8012b`.
- `KT-018`: refined self-employed guide opening sequence is verified and
  delivered to `origin/main` through `5a099fb2`.
- `KT-019`: VAT report attachment parity for manual and Drive source files is
  verified and delivered to `origin/main` through `8f1078ce`.
- `KT-023`: the Tax Authority compliance knowledge base is manager-reviewed and
  ready for delivery through documentation commit `3e0997f3`; it contains 11
  checksum-verified official PDFs, a requirements matrix, prioritized gaps, a
  verification plan, and SHAAM reconciliation. No application code, schema,
  production access, or live external request was involved.

## Pending integration

- KT-021 full-guide continuation approved on 2026-10-05: all 37 source commits
  `9665cd78` through `6c2aa43b` integrated over main `d68ea0ce`, code head
  `77c44187`. 41 focused guide/calculator tests and frontend production build
  passed. Subsequently rebased onto `56bf924d`, reran 41 tests and build,
  and pushed/remote-verified full delivery through `1ab097b4` on main and
  codex/integration-kt021. No backend, preview or unrelated CI changes.
  This expands the older September scope below. Preserve the live worker tree.

- KT-021 approved guide through source `4d99d388` is verified on
  `codex/integration-kt021` over fresh main `daedd44d` (code head `26b6387f`).
  23 focused Angular tests and the full frontend production build passed.
  Pushed and remotely verified through `91a88e38`; unrelated CI work and the
  newer payroll slide are excluded. Local main is aligned.
  Preserve the live worker worktree/server on port 4201 after delivery.

- KT-027 and KT-028 passed combined verification and were pushed to `origin/main` through `be15a03c`. The standing local `codex/integration` branch contains unrelated, undelivered CI work (`bf682e70`), so these fixes were integrated on `codex/integration-kt027-kt028` without that change. No production deployment was performed.
- KT-029 fixes admin SYSTEM sub-category card reassignment and save feedback. Worker and clean integration trees are identical (`6d717f76`); focused Jest and both production builds passed. Integrated as `bb28cfc1` on `codex/integration-kt029` because the standing `codex/integration` branch still contains unrelated, undelivered CI work. Pushed to `origin/main` through `c00c8abb`; no production access or deployment was performed.
- KT-030 adds admin creation of SYSTEM expense sections with an editable, suggested free block code. Worker commit `f4034f80` passed 48 focused Jest tests, five final section-specific tests, and both builds. Integrated and pushed through `4ee8ba48` on `codex/integration-kt030` and `origin/main`; the standing `codex/integration` branch still contains unrelated, undelivered CI work. No schema, production access, or deployment is involved.
- KT-039 isolates authenticated profile/business caches per browser tab and
  hardens the admin UI route plus three legacy backend triggers. Code commit
  `b26ddef0` passed 8 focused frontend tests, 11 backend security tests, and
  both production builds. It was pushed through `f78f1fef` on
  `codex/integration-kt039` and `origin/main` because the
  standing `codex/integration` branch still contains unrelated, undelivered CI
  work. No schema, production access, or deployment is involved.

## Open decisions

- Add the second developer's shared profile after their name, role, and owned
  areas are supplied.
- None affecting the documentation architecture. The second developer's
  profile can be added later without changing the shared workflow.

## Next step

Review the P0 compliance findings with an Israeli accountant/tax adviser and
the relevant legal/security reviewers before approving implementation tasks.
No production deployment was performed.

## Document PDF and identity images integration — 2026-10-15

Elazar accepted the local feature and explicitly requested delivery to main. Repository: TaxMyself-dev/TaxMyself; refreshed remote/main baseline 020632b2. Integration retains current main changes, uses the new renderer exclusively and fixed clean signing template 3IfhJjgmAp. Only FILLFASTER_API_TOKEN remains secret configuration. Two nullable image columns were previously applied to authorized development DB only; no schema statements or production actions run during delivery. Other feature refs are preserved. Combined validation and push outcome are recorded in docs/tasks/active/document-pdf-redesign.md.

## PDF pipeline and preview delivery — 2026-10-18

Elazar explicitly approved delivery of backend, standalone PDF renderer and
frontend, plus the local frontend API port correction to3000. Refreshed clean
main09012397 fast-forwarded to e9df110e; atomic push and git ls-remote verified
main and codex/pdf-service at that source commit. No codex/integration ref was
modified. Nest/Angular release builds passed on identical candidate source;
153 backend and13 frontend tests passed again in primary main. Service20 tests,
four HTTP PDFs and three browser layout cases passed. Deployment remains manual;
see docs/features/pdf-service-release.md for current operator commands/rollback.
No production access/deployment or schema/discount calculation fix occurred.
The second developer owns the deferred discount defects; audit tests characterize
them. Preserve the existing feature worktree/dev setup. This record adds no
runtime code; final documentation commit is pushed after the source delivery.

## Feezback spouse and source-deletion integration — 2026-10-20

Elazar requested merging codex/feezback-spouse (25864c52) and its dependent
codex/feezback-delete-payment-source (2275965d). Fetched origin and updated
clean main from 72098ca9 to d59ee789 before staging on codex/integration.
Both merges applied without conflicts. Combined review/checks passed:
14 backend suites / 105 tests, 33 isolated frontend tests, Nest build and
Angular production build. Desktop/mobile local API URLs are 3000. Details
and exact commands: docs/tasks/archive/2026.md (Feezback main delivery, 2026-10-20).
Prior approved user/source/FK SQL is included but was not executed during
integration. No production access, provider calls or deployment occurred.

Delivery verified: 461885a2 on local main, origin/main and both integration refs; both requested feature tips are included. Task records archived after delivery. No production deployment.

## KT-080 demo source-record seed repair — 2026-10-20

The demo-data seed now resolves every declared source sync row to its permanent
`Source.id` and persists the required `sourceRecordId`, including the normal
seed/reset and Direct-card scenario writers. Missing or ambiguous fixture
sources fail atomically. Integrated code `76f4f0da` passed 3 focused Jest suites
(16 tests) and the Nest build; local main, `origin/main`, and
`codex/integration-kt080` were verified at that commit. No schema, production
data, provider call, accounting, authorization, or deployment action occurred.

## Approved login copy/layout delivered — 2026-10-20

User approved final illustration size and both personal copy changes before
integration/push. Refreshed main matched origin/main at b1f7b27f. Approved source
commits a0cb8691 and 95429901 merged without conflicts; production frontend
build and four focused settings tests passed. Code delivery 416047e0 verified
on local main/origin/main and both integration refs. Ports remain 3000; no
backend/schema/provider change or deployment. Durable evidence is archived in
docs/tasks/archive/2026.md under Approved login copy and layout delivery.

## KT-083 partner-candidate couple demo — 2026-10-20

Added an isolated REGULAR-only synthetic Open Banking demo for Shani and Omer:
licensed + exempt businesses, two bank accounts, three credit cards, primary
and spouse source identities, and 70 varied fixed-date transactions from
January through October 2026. Login/manual/retry sync paths are verified not to
call Feezback; there is no delegation, admin/accountant role, or self-reset.
Integrated code `7236477f` passed 6 focused Jest suites (30 tests) and the Nest
build; local main, `origin/main`, and `codex/integration-kt083` were verified at
that commit. No live profile seed, schema, production-data, provider,
accounting, authorization, or deployment action occurred.

Open-banking delivery confirmation (2026-10-25): main and codex/integration were atomically pushed to274b54fa; GitHub ls-remote and local/tracking refs all matched. Task marked PUSHED. Completion bookkeeping only follows; no deployment or production action.

Billing reconnect loop correction (2026-10-25): root recovery effect accidentally tracked synchronous billing service reads. Mocked-HTTP real-effect regression reproduced2 failures before correction; Angular untracked around shared refresh removes feedback while preserving next-outage recovery.15 focused frontend tests and production Angular build(hashe8f0a44488522975) passed; independent scoped review found no blockers. Fast-forward integration preserves the tested executable tree; this record alone follows. No billing policy, schema, backend, provider, database, deployment or runtime restart change.

## KT-096 admin subscription table filters — 2026-10-25

The admin CardCom/subscriptions list now excludes every user registered in the
canonical demo-profile registry. Its table adds an all/active/trial/expired-
trial status filter; complimentary full-access rows remain visible under All
but are not misclassified as expired trials. Source commit `f2552fe6` passed the
focused backend suite (14 tests), focused frontend suite (7 tests), Nest build,
and Angular production build before reaching `origin/main`. No schema,
production data, CardCom/provider call, authorization, accounting, deployment,
or runtime restart occurred.
