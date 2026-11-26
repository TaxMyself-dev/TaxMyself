# Document generation speed

- Status: `WORKER_COMPLETE` (verified locally; awaiting separate integration approval)
- Task manager / implementer: Codex
- Worktree: C:/Users/user/Keepintax/TaxMyself-document-generation-speed
- Branch: codex/document-generation-speed
- Base commit: c46490a71dca24ca07250b1ae9233047b72b4a41 (main = origin/main after fetch)

## Business outcome and acceptance criteria

- Recipient email can be queued atomically with issuance and sent after commit,
  without delaying issuance on Brevo. Opt-in until SQL/application is separately approved.
- Reuse the in-memory signed original for initial delivery; recover pending work
  after restart using the saved original. Bounded retries and explicit unknown outcomes.
- No email when recipient sending was not selected; rollback never dispatches mail.
- Cache immutable normalized identity images with bounded memory/TTL; replacements
  and removals affect subsequent PDF generation immediately via current identity lookup.
- Allocation finalization uses shared preparation, render/sign overlap and parallel uploads.
- Parallel signing preserves both signed outputs and settles in-flight work
  before failure; enabled by default after the user supplied provider confirmation
  on 2026-11-25. Explicit false restores sequential signing.
- Focused behavior tests, backend build, docs and local commit; no main integration/push.

## Scope and approval boundaries

User explicitly approved preparing one outbox table and SQL only on 2026-11-25.
No DB connections, schema execution, production access, live email or paid signing calls.
No change to journal logic, numbering, amounts, existing PDF files or authentication.
New scheduler route shares the existing OIDC identity verification with independent email activation. AI dispatch activation/policy is unchanged.
Main integration and GitHub push require the user's separate explicit approvals.

## Verification evidence (2026-11-25)

Backend service/controller/domain tier: focused changed-behavior and direct-caller
tests plus Nest build. No frontend changes, renderer/template changes or accounting
calculation changes; frontend production build, real Chromium layout checks and
repository-wide Jest were not applicable. No snapshots were updated.

All npm commands below ran in this worktree's `backend/` directory. Dependencies
were independently installed with `npm ci --no-audit --no-fund` (exit 0; 1177
packages; existing dependency deprecation warnings). No shared node_modules,
dependency updates, copied build caches or package-lock changes.

1. Initial implementation batch (exit 0, 6 suites / 77 tests, 66.436s):

```powershell
npm test -- --runInBand --silent --runTestsByPath src/identity-images/image-cache.spec.ts src/documents/document-email-queue.spec.ts src/documents/document-email-issuance.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/documents-draft-issuance.spec.ts src/documents/transfer-details.spec.ts
```

2. Direct regression and extra transport/queue boundary batch (exit 0,
   7 suites / 82 tests, 30.118s):

```powershell
npm test -- --runInBand --silent --runTestsByPath src/mail/mail-attachment-options.spec.ts src/documents/document-email-queue.spec.ts src/identity-images/identity-images.spec.ts src/documents/pdf/fillfaster-signer.service.spec.ts src/shaam/services/shaam-allocation-orchestrator.service.spec.ts src/shaam/services/shaam-document-allocation.service.spec.ts src/document-ai/document-ai-scheduler.spec.ts
```

3. Final affected suites after decoupling email activation from AI scheduling
   and adding silent-stream-close handling (exit 0, 3 suites / 62 tests, 19.540s):

```powershell
npm test -- --runInBand --silent --runTestsByPath src/document-ai/document-ai-scheduler.spec.ts src/documents/document-email-scheduler.guard.spec.ts src/documents/document-email-queue.spec.ts
```

These are overlapping focused batches, not one full-suite run on the final
revision. Unaffected results from earlier batches were reused; affected queue
and shared guard suites were rerun after the final executable changes. Existing
Nest logger fixture output in the SHAAM tests is expected; no live service calls.
No failing focused checks or known baseline failures were encountered.

`npm run build`: exit 0 on the final executable revision (also passed at the
initial implementation checkpoint). Application was not bootstrapped.
`git diff --check`: exit 0. Static verification: five local Markdown links,
matching migration/cutover SQL, expected columns/indexes, no automatic ORM schema
registration, and instruction discovery passed. No DB grammar/execution test is
claimed. No repository Markdown-link runner was found; targeted link existence
checks covered changed/new operational documentation links.

## Handoff

- Result: implementation and permitted automated verification complete.
- Base: `c46490a71dca24ca07250b1ae9233047b72b4a41`; fetched origin/main matched.
- Local commit: see the tip of `codex/document-generation-speed` (this task file is included in it).
- Changes: document issuance/pair orchestration, recipient outbox/worker and
  guarded scheduler route, shared scheduler activation hook, bounded identity
  image cache, optional mail SDK timeout/sanitized logs, focused tests, prepared
  SQL, and nearest topic/feature operational documentation.
- Schema: one approved prepared-only table; SQL not executed. No entity is
  registered, so synchronize cannot create this table. Flag remains disabled.
- Production: no access, deployment, restart, scheduler creation or env changes.
- Security: existing exact OIDC audience/email/sub/verified-email/issuer/expiry
  policy reused. Existing AI mode/policy unchanged; new email route activation
  is independent. Tenant/controller ownership and storage paths are unchanged.
- Accounting: no numbering, amounts, journal, tax/allocation or parent-close
  behavior changes. The allocation PDF pair/upload orchestration is optimized.
- External impact: no paid signing requests, live email or provider contract/
  credential changes. Provider approval for two parallel requests (same or
  different templates) supplied by Elazar on 2026-11-25 permits the new parallel
  default. Numeric quotas remain unspecified. Other MailService callers retain
  their existing transport settings.
- Runtime checks still required before queue activation: separately authorized
  isolated DB DDL/transaction/competing-worker checks, intentional test-email
  recovery and authenticated scheduler invocation; no current end-to-end latency
  or production speedup percentage is claimed.
- Main remains at the base, clean and untouched. No merge, push or deployment.
- Worktree attached to this chat; retained for review because it is not integrated.
- Local ignored `backend/.env` copied without exposing values; tracked landing
  environment file already supplied by the checkout. No env file is committed.

## Integration

Await Elazar's explicit approval before local main integration. SQL execution
and queue/scheduler activation require separate authorization. After authorized
main integration, his personal test of that exact main revision and explicit
push approval remain required. Cleanup applies only after approved integration
and its required checks, not at this feature-ready checkpoint.

## Provider confirmation follow-up (2026-11-25)

Elazar supplied Banal Sadon's 10:54 reply explicitly allowing two parallel
requests with either the same or separate templates. Numeric quota limits and
the precise failure response were not supplied. Change the default to parallel
while preserving `PDF_PARALLEL_SIGNING=false` as a rollback switch. No automatic
signing retries, runtime env changes, main integration, DB execution or push.

Acceptance: prove default and explicit-true overlap, explicit-false sequential
behavior, draining on failure and no quota-error retry; run affected PDF routing
and signing tests, direct issuance/allocation callers and Nest build. Existing
queue/cache verification is reused because those inputs are unchanged.


Follow-up verification on the executable revision after `6aa16408`:

```powershell
npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/document-pdf-routing.spec.ts src/documents/pdf/fillfaster-signer.service.spec.ts src/documents/documents-draft-issuance.spec.ts src/documents/transfer-details.spec.ts src/documents/document-email-issuance.spec.ts
```

Exit 0: 5 suites / 65 tests passed, 35.738s; zero snapshots. Covers unset/true
parallel overlap, false serial mode, in-flight failure draining and no quota-error
retry, plus direct issuance/allocation/email transaction callers. `npm run build`
passed on this executable revision (exit 0). Static local-link/SQL/instruction
checks and `git diff --check` passed. No live provider requests or actual latency
measurement. Earlier queue/cache/guard tests remain applicable to unchanged code;
they were not rerun. No database or runtime/deployment configuration was changed.
The local feature branch remains separate from main and has not been pushed.
`main` independently advanced to `7cdc8580` by the final read-only check. This follow-up does not integrate/rebase that main revision or claim verification on it; integration review must use current main.


## Requested before/after measurement (2026-11-25)

Elazar explicitly approved **up to 24 synthetic live signature requests** in chat.
Exactly 24 were made: diagnostic batch 4, inspected successfully, remaining 20.
No automatic retry, live app document, DB/schema write, storage upload, email,
SHAAM call, main integration or deployment. Original quota/DDL gates remain.

Measured application revisions: before `c46490a71dca24ca07250b1ae9233047b72b4a41`,
after `bd2476be39e6f2ee9a1f39a7dd21ee3537579b93`. Actual historical DocumentsService
and ImageStorageService were compiled in isolation with the unchanged current
renderer/template dependencies. The app was not bootstrapped. DB initialization
was explicitly forbidden, Firebase was mocked, and only the existing signer
could make live requests during the explicitly selected live phases.

Evidence is in [the measurement report](../../features/document-generation-speed-benchmark-2026-11-25.md)
and its linked sanitized JSON. Real signatures/Chromium were combined with
simulated non-signing I/O for three scenarios, two paired repetitions each.
Final controlled local run covered ten scenarios x three repetitions x two
variants, plus eight failure checks. All 24 signed PDFs passed envelope/page/
synthetic-content checks; allocated PDFs contained the synthetic number. No
cryptographic certificate-trust result or production end-to-end improvement is
claimed. The live matrix preceded the two-browser resource refinement.

Findings: allocated multipage document with logo improved 4.656s -> 3.448s
(25.9%) with real signing; ordinary receipt 2.793s -> 2.739s (1.9%) and short
allocation finalization 2.491s -> 2.367s (5.0%) were inconsistent between pairs.
Controlled queue-on creation improved 2.452s -> 1.511s (38.4%), but queue DB/
scheduler activation is unverified and still disabled. Cold start and simple
issuance did not show a consistent benefit; negative samples are retained.

Two preliminary local runs were intentionally interrupted; inspection found
idle Chromium processes accumulating by scenario. Their results are excluded
from final local aggregates and retained privately. Diagnostic harness cleanup
was changed to bound the comparison window to two browsers; no product code,
fixture acceptance criterion or threshold was weakened. A PDF verifier filename
mapping error was corrected after its failed run; no new paid requests followed.

Exact commands, results, skips, ranges and caveats are in the report. Final
focused Jest batch: 7 suites / 96 tests passed, exit 0, 44.524s. Node syntax,
local Markdown links/JSON integrity and whitespace checks passed. Prior build
evidence is reused because product code was unchanged. Local feature commit
contains reproducible scripts, sanitized evidence and docs only.


## Full DEV UI reproduction (2026-11-25)

Completed 12 real DEV UI issuances (three types x before/after x two repetitions),
24 additional user-authorized signatures, no emails/SHAAM/schema execution.
All HTTP 201 and UI success. Warm repetition: transaction invoice 9.176s -> 6.307s,
cash receipt 8.002s -> 5.578s, quote 7.640s -> 6.295s. Cold first transaction
24.974s -> 13.378s; kept separate from warm comparison. Logo cache hits 1-2ms
versus baseline 1.331-3.137s downloads. Real storage/signing variation remains.

See [full DEV report](../../features/document-generation-dev-e2e-2026-11-25.md)
and linked sanitized request/stage evidence for exact source loading, commands,
PDF verification, setup interruptions and limits. No product code changed.
Existing unit/build evidence reused; pdf-service npm ci/build succeeded locally.
Allocation-number live UI remains unverified because authorized issuer is exempt
and sandbox allocation requires its dedicated issuer. Queue remains off and SQL
unapplied. Final 3004 backend restored to optimized after mode; 4204/3004 tabs
remain open. No main integration, push or deployment was performed.


## PDF startup follow-up (2026-11-25)

User authorized implementing measured PDF preparation improvements. Added
synthetic startup warmup before standalone production/local listener readiness,
explicit opt-out, finer development page-preparation stages and bounded actual
Chromium comparison harness. Kept fresh contexts and existing security/capacity/
deadline behavior. Removed experimental page-security concurrency after noisy
measurements; no steady-state speedup or full DEV SLA is claimed.

Final checks: 27 service tests passed, service template build passed, four HTTP
PDF cases and three numeric-layout cases passed, 12 final PDFs match baseline
text/page counts, two visually inspected. Actual local entrypoint warms before
ready. Earlier full DEV/signing evidence is not presented as verification of
this new executable source. No DB/schema/mail/signature/cloud changes.

See [startup evidence/report](../../features/pdf-startup-2026-11-25.md) for exact
commands, batches, final/mixed revision distinction and cold-start cost caveat.
Local feature commit only; awaiting separate main integration approval.


## Actual rendering follow-up (2026-11-25)

Added PDF-only center-cover 640px logo variant; ordinary/stored originals remain
unchanged. Variants share existing bounded memory/TTL/in-flight budget and have
separate keys. Current identity path still handles replacements/removal.

Compared bfe8baac vs final source: 12 actual DEV UI documents, 24 additional
authorized signatures, no mail/live SHAAM/SQL. All succeeded. Renderer pair mean
1.804s -> 1.212s (32.8%); warm-logo full mean 5.843s -> 4.614s (21%, n=5 each).
All-request full mean 6.252s -> 5.117s; first after cache miss still 7.627s.
One baseline preview deliberately warmed its second-run cache, separately logged.

Build passed; focused 5 suites/69 tests plus 3 suites/32 tests passed (101 total).
12 optimized synthetic PDFs match baseline text/page count; actual signed source
and copy downloaded/visually inspected with 640px logo and signature envelopes.
See [rendering report](../../features/pdf-logo-rendering-2026-11-25.md) and linked
sanitized evidence for commands, source hashes, initial corrected mock failure,
small-sample/provider-noise limits and remaining integration boundaries.

Final 3004 backend restored to optimized source, 4204/8082 unchanged and healthy.
Local feature only; no main integration, push, deployment or cloud cost change.


## DEV email queue activation (2026-11-26)

User explicitly requested activation, superseding prior prep-only DDL scope for
keepintax-dev only. Applied prepared outbox CREATE TABLE; verified transaction
rollback, fresh-worker recovery, competing claims, invalid-file cancellation and
pre-send retry against real MySQL with fake attachment/mail transport. Three
synthetic test jobs retained as CANCELLED; zero pending work/external mail.

Enabled queue on isolated local backend 3004 and its queue-only ten-second timer
while preserving disabled unrelated schedulers, synchronize and seeds. Startup
worker marker and health 200 verified. No source-code behavior change; original
6906f809 build evidence reused. Three focused suites / 39 tests passed, 44.206s.
See [activation report](../../features/document-email-dev-activation-2026-11-26.md)
for exact command, transport/restart limitations and applied-DDL evidence.

No production/cloud/scheduler configuration or main integration. Early upload
overlap was explained, not implemented. Entry-screen preloading remains pending.
Feature-branch push is authorized under Elazar's replacement AGENTS instructions;
main remains untouched.

## Upload overlap follow-up — 2026-11-26

Implemented independent signed-file upload chains for issuance/allocation, with
all-settled draining and cleanup before rollback. Final focused run: 7 suites /
99 tests, 42.279s, exit 0; backend build exit 0. Controlled comparison 24 runs
passed. Full DEV comparison 8 documents / 16 signatures, no email, mean service
creation 4.626→4.060s. One baseline UI wait timed out with server commit complete;
missing HTTP total retained explicitly. No live allocation test, production or
main integration. See [report](../../features/pdf-upload-overlap-2026-11-26.md)
for exact commands, baseline revision, evidence, limitations and source hash.

## Entry preload / PDF weight follow-up — 2026-11-26

Implemented advisory entry/business-switch preload and selective opaque-logo
JPEG compression (original assets unchanged). Baseline 5db0e1cd; see
[report](../../features/pdf-entry-logo-2026-11-26.md) and source fingerprints.
Local matrix 36 PDFs plus 6 cold/warm renders; actual read-only DEV integration
8 unsigned outputs. All 22 compared pairs preserve text/page counts; final
representative pages rendered/visually checked. No new signatures/documents/mail.
Frontend 28 and PDF service 27 tests passed; both builds passed. Full UI check
could not complete because browser control timed out; no UI pass claimed.
No Belgium/cloud/production changes or main integration; local backend restored
to after mode with queue active.

Final backend focused checkpoint: 6 suites / 70 tests, exit 0, 80.522s. Backend root and PDF health returned 200; frontend 4204 compiled successfully.
