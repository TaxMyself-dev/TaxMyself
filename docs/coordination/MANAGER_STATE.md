# Primary manager state

## KT-125 deterministic release installs — 2026-11-23

The Stage 4 release failure was caused by a backend `package-lock.json` that
did not contain the nested `google-auth-library@11.3.4` graph required by the
current manifest under npm 10.9.7. The backend lockfile is synchronized without
changing application code, package manifests, schema, deployment configuration
or production data; the user's current frontend lockfile is preserved.
Integration `7f783539` passed independent clean `npm ci` installs for backend
(1,177 packages) and frontend (1,492 packages), followed by both production
builds. The required main local-port check confirmed frontend 4200, backend
3000 and `http://localhost:3000/`, with no process or local port override.
Existing engine/deprecation and Angular budget/CommonJS warnings remain
non-fatal. Production deployment remains an authorized-operator action under
`PRODUCTION_POLICY.md`.

## KT-124 SHAAM draft completion — 2026-11-23

OAuth recovery drafts are excluded from issued-document listings, the SHAAM
success page delegates return navigation to the guarded `/doc-create` route so
the first click waits for authoritative access state, and allocation
finalization closes a linked open transaction-invoice parent in the same
database transaction. Integration tip `4d6669b6` passed 4 focused backend and
4 focused frontend tests plus both production builds; the required main local
port check confirmed frontend 4200, backend 3000 and
`http://localhost:3000/`. No schema, journal-value, authorization-policy,
external SHAAM contract or production-data change was made. Existing production
parent 40000 is not repaired retroactively. Production deployment remains an
authorized-operator action under `PRODUCTION_POLICY.md`.
Source delivery `4ca92d16` was pushed to `origin/main` and
`origin/codex/integration-kt124`; the final task-status tracking commit follows.

## KT-116/KT-117 Allocation button borders and risk-based gates — 2026-11-19

All white actions in the document-allocation decision and completion dialogs
now use the existing `WHITE_BORDER` variant, preserving a visible black outline
without changing the global white-button style. The repository quality gates
now classify changes by risk: local presentation-only edits use a direct
template/component assertion plus the frontend build and visual check, while
behavioral, shared, service, backend and infrastructure changes retain broader
targeted verification. The original focused runs passed 52/52 allocation/table
tests and 27/27 doc-create tests; after reconciliation with the newer remote
main, static allocation-style checks and the Angular production build passed.
Feature commit `aa549003` and governance commit `362ec52b` were pushed through
delivery `362ec52b`. No backend, database, accounting, external-service,
production, or deployment action occurred.

## KT-114 Hosted checkout terminal result — 2026-11-15

CardCom `GetLpResult` non-success responses now release a hosted checkout only
when they echo the exact LowProfile, terminal and ReturnValue identity and carry
no successful or transaction-bearing signal. Credential, transport, malformed,
foreign and conflicting results remain fail-closed. Bounded provider response
code/description persist for admin diagnosis, later transport failures no longer
erase the last provider diagnostic, and token-free request/outcome logs make the
read-only CardCom check visible. Integration commit `7aa60eb6`; three focused
Jest suites / 76 tests and the Nest production build passed on the isolated
integration tree. No schema, production data/access, credential, provider-write,
amount, VAT, receipt, accounting or deployment operation occurred.
Delivery `57150ad6` was pushed and verified on `origin/main` and
`origin/codex/integration-kt114`; production still requires a normal backend
deployment.

## KT-107 Drive OCR at-most-once — 2026-11-10

Drive-backed OCR now persists a unique `PROCESSING` claim before Claude is
called. Every live row and content checksum is a permanent automatic-processing
claim, including provider/parser failures and rejected documents; same-batch
duplicates are claimed before the first result is known. Failed files move to
`processed/` and cron, report navigation, immediate upload, WhatsApp and email
intake cannot call Claude for them again. The explicit stateless form-prefill
OCR endpoint is unchanged. Integrated commit `6ba1c4af`; focused verification
on integrated `main` passed 4 suites / 19 tests and the Nest build. No schema,
production, authentication, accounting or external-provider operation was
performed; normal backend deployment is still required for production effect.
Delivery `97451bff` was pushed to `origin/main` and
`origin/codex/integration-kt107`; the final task-state commit records remote
verification only.

## Direct-card cashflow — local main integration, 2026-11-05

Elazar authorized local integration for personal main testing and explicitly
forbade pushing. Merged main 99e604b0 into codex/direct-card-cashflow at 3880d3bf,
preserving permanent source-ID handling, consent-aware sync and full-sync retry.
Included his final copy edits. Approved Direct-card imports replace old skip
expectations; bank exclusion remains owner opt-in by stable SYSTEM subcategory.
Combined checks: 23 backend suites / 277 tests and six frontend suites / 59 tests
passed; isolated-output Nest build and Angular production build passed (existing
budget/CommonJS warnings). No production, provider or DB operation during merge;
the approved dev schema was already applied. Deliver verified descendant to local
main only. Retain feature worktree; no push until Elazar personally tests the
current main revision and explicitly approves. See
[task evidence](../tasks/active/direct-card-cashflow.md).

## Billing existing-invoice recovery — local main integration, 2026-11-03

Elazar authorized local main integration after review and combined checks, with
no push until his personal test and explicit approval. Integrated current main
978ea5ca into the existing billing feature at e25fa17e, preserving global schedule
disabling and the newer Lychee/WhatsApp modules. Retained both start commands and
added schedule-switch regression coverage. Backend: 39 suites / 575 tests and
2 native adapter tests passed; Nest build passed. Frontend: 3 real Chrome tests
and production build passed, with nonfatal budget/CommonJS warnings. Review found
no blocker; no schema, production, provider, ignored-env or runtime change was made.
Validated descendant prepared for local main fast-forward; see
[task evidence](../tasks/active/billing-pdf-recovery.md). Keep the feature worktree
and all commits local until Elazar tests current main and approves pushing.

## KT-104 Uniform File branch completion — 2026-10-29

Reconciled the long-lived Uniform File branch with current `main`, preserving
the newer restart-safe submission architecture while adding verified tsandbox
response handling, owner-only SHAAM network operations, token-rejection
recovery, SMS MFA foundations and security monitoring documentation. Focused
backend verification passed 10 suites / 96 tests; Nest and Angular production
builds passed; dedicated Uniform File and MFA TypeScript spec programs passed.
Integration `fed29415` was pushed by normal fast-forward to the feature branch
and `main`. No production, taxpayer-data, portal, Firebase or Cloud mutation
was performed; those external activation gates remain explicit.

## KT-106 Allowlisted Cloud Run startup diagnostics — 2026-10-27

Stage 8 no longer retrieves arbitrary ERROR messages and then attempts to
redact them. Its exact-revision Cloud Logging query now accepts only explicitly
allowlisted safe prefixes, and the local parser requires a complete approved
shape before reconstructing output from constrained numeric captures. The
current allowlist contains only catalog-integrity failures; unknown messages,
stacks, probes, and secret-bearing free text retain the original gcloud error.
Release regressions passed in Windows PowerShell 5.1 and PowerShell 7.
Delivery `8fcdef24` is ready for push; Codex performed no production action.

## KT-105 Cloud Run startup failure diagnostics — 2026-10-27

Failed Stage 8 candidate deployments now query ERROR logs for only the exact
expected Cloud Run revision and surface one concise application exception as
the terminal failure reason. Generic startup probes no longer hide the real
cause. Output is single-line, capped at 500 characters, and redacts common
credential fields and bearer tokens; raw JSON and stacks are not persisted.
Empty logging results retry briefly, while log-read failures retain the
original gcloud error. Release regressions passed in Windows PowerShell 5.1 and
PowerShell 7. Delivery `452e640a` is ready for push; Codex performed no
production action.

## KT-104 Public registration smoke gate — 2026-10-27

Stage 13 was traced from its Playwright artifact: `GET /auth/get-cities`
succeeded with 200, while an unauthenticated root-app refresh called
`GET /billing/me`, received 401, and could race the public registration route
back to login. Billing refresh on selected-client emissions is now gated on an
authenticated user. The read-only smoke requires cities status 200 and reports
critical HTTP failures with exact status, method, and URL. Focused frontend
tests 2/2, smoke unit tests 8/8, and the Angular production build passed.
Delivery `1f33b6b8` is ready for push; Codex performed no production action.

## KT-103 Cloud Run job environment arguments — 2026-10-27

The guarded release again stopped safely at Stage 10 because the custom gcloud
dictionary delimiter was escaped for a different shell layer and rejected by
Windows PowerShell/gcloud. Job environment and secret flags now use sorted,
comma-separated `KEY=VALUE` entries; plain values remain Base64 encoded and
comma/newline input is rejected. Exact encoding and unsafe-input regressions,
the full release fixture suite, parser checks and 8 smoke config tests passed.
Delivery `5986c185` was pushed and verified on local/remote `main`. The operator's
candidate remained at zero traffic; Codex performed no production action.

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

## KT-108 recurring debt recovery isolation — 2026-11-14

Production evidence showed that a legacy open CHECKOUT obligation could enter
the atomic recovery reservation even though preview displayed only the true
RECURRING_PERIOD debt, producing a safe pre-provider quote conflict. The
reservation query now locks only open recurring obligations, matching preview;
historical checkout and independent one-off records remain untouched. Commit
`0ac04249` passed the focused orchestration suite (56 tests) and Nest build on
the integrated tree. Local main, tracking origin/main and the remote main ref
were verified at that commit. No schema, CardCom/provider call, accounting,
authorization or deployment action was part of the code delivery.

## KT-113 hosted checkout resolution gate — 2026-11-15

Canonical CardCom returns now enter an authenticated payment-status route that
uses owner-scoped, read-only provider inspection and the existing idempotent
hosted-completion path. Durable `pendingCheckout` state blocks dashboard,
plans and recovery re-entry across refresh/close/login, and only backend
`COMPLETED` plus refreshed non-blocking billing state unlocks the dashboard.
Provider uncertainty never creates another charge; a verified decline returns
to the matching payment flow. The old 90-second infinite-spinner race and a
method-level recovery duplicate-submit gap were closed. Source commit
`c6ff86bb` passed 6 backend suites / 140 tests, 35 focused frontend tests, Nest
build and Angular production build. Integrated main additionally passed 23
focused backend tests; its Chrome rerun was blocked before spec loading by a
local Windows GPU/cache crash, while the identical source had already passed
35/35 in the isolated worker. No schema, data, amount/VAT, receipt/accounting,
credential, provider-write, production or deployment action occurred.

## KT-118 manual allocation portal details — 2026-11-19

The pending-allocation manual flow now shows selectable, read-only values for
the Tax Authority request type, document reference, customer identifier, date,
pre-VAT amount, VAT amount and item/service descriptions loaded from the
document lines. A line-loading failure remains non-blocking and preserves the
general document description as a fallback. Feature commit `9d2d7688` and its
worker handoff reached `origin/main` at `2c2c3b6b`. The integrated tree passed
the isolated allocation-flow Karma spec (7 tests) and Angular production build;
no unrelated suites were run under the component-behavior tier. No schema,
database, accounting, authorization, Tax Authority write, production change or
deployment occurred.

## KT-119 manual allocation dialog state — 2026-11-19

Fixed the PrimeNG dialog transition that cleared `pendingFinalizeRow` after the
user chose manual allocation, leaving only the Tax Authority link and
allocation-number input visible. The method-choice `onHide` now preserves the
row while the manual dialog is open, so all copyable portal fields remain in
that same popup; explicit dismissal still clears state. Fix commit `06f9f3cd`
reached `origin/main` at `38326e0e`. Only the focused allocation-flow Karma
spec ran (8 tests), followed by the Angular production build; both passed. No
backend, schema, database, accounting, authorization, Tax Authority write,
production change or deployment occurred.

## KT-120 manual allocation during document creation — 2026-11-19

The mandatory allocation decision on the document-creation page now includes a
bordered white "הפק מספר הקצאה באופן ידני" action. It persists the numbered
`PENDING_ALLOCATION` document and journal entry, then navigates with the saved
document snapshot so the existing populated manual-allocation dialog opens on
the incomes page. Feature commit `903318c9` reached `origin/main` at
`9dde9e6b`. Verification was intentionally minimal: one isolated Karma test and
the Angular production build passed; no other suites ran. No backend, schema,
database, accounting-rule, authorization, Tax Authority write, production
change or deployment occurred.

## KT-121 SHAAM connection-check loading — 2026-11-19

Automatic allocation on document creation now gives immediate and continuous
feedback. The existing modal first displays "בודק חיבור לרשות המסים", then
switches to "מפיק מספר הקצאה" after a usable connection is confirmed and stays
visible while the pending document and allocation request complete. It closes
before disconnected/error feedback is shown. Fix commit `1fe8a9cc` reached
`origin/main` at `5a2729d6`. Verification was intentionally narrow: two isolated
Karma tests and the Angular production build passed; no other suites ran. No
backend, provider-contract, schema, database, accounting, authorization,
production change or deployment occurred.

## KT-122 report-period defaults — 2026-11-19

VAT report entry now keeps the selected business's configured monthly or
bimonthly cadence while selecting the most recently completed reporting
period; in November/December a bimonthly business opens on September-October,
including correct previous-year rollover. Annual-report entry now defaults to
the current calendar year while preserving an explicit `taxYear` query
parameter. Feature commit `0897fa3c` reached `origin/main`. Verification was
intentionally narrow: four isolated Karma tests and the Angular production
build passed; unrelated suites did not run. No backend, schema, database,
report-total, accounting, authorization, production change or deployment
occurred.

## KT-123 P&L annual default — 2026-11-19

Clarified that the requested annual default belongs to the profit-and-loss
report filter, not the annual-report preparation wizard. P&L now opens in
annual mode for the current calendar year, while review-return parameters
still restore their explicit period. The unrelated annual-report wizard was
returned to its prior completed-tax-year default. Feature commit `451b18af`
reached `origin/main`. Per the user's explicit request, verification was limited
to `git diff --check` and targeted static assertions; no Karma suite or Angular
build ran. No backend, schema, database, report-total, accounting,
authorization, production change or deployment occurred.


## Document Scheduler local-main integration — 2026-11-22

Elazar explicitly approved local integration of codex/scheduler-background-round,
with no push or deployment. Starting clean main: 17961d37. Feature commits
2f1bd4f5 and 1db6ad4f were combined with that main without conflicts; executable
candidate 9ee58c5f retains the already-integrated remote reconciliation and agent
packaging fix. Selected backend/Drive regression tier passed 215 tests in 24
suites; seven offline agent loader/image-contract checks passed. Nest build:
passed, exit 0 (full TypeScript checking; command: $env:NODE_OPTIONS='--max-old-space-size=2048'; npm run build). Main startup print-config and existing listeners verify
4200/3000 with http://localhost:3000/ and no active worktree port override.
Full commands, warnings, skipped checks and safety boundaries are in
docs/tasks/active/document-ai-scheduler.md. Only documentation follows the
tested executable candidate before the conditional clean-main fast-forward.
No remote push, deployment, cloud config, schema, provider or user-data action.
Manual testing of the delivered current main and separate explicit push approval
are still required before any future push. Feature worktree is retained.
