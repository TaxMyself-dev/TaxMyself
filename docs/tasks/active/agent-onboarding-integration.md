# Agent onboarding integration candidate

Status: VERIFIED_CANDIDATE

## Authorization and acceptance

User explicitly requested a separate integration branch, conflict resolution and
checks on the combination with main. No merge into main, push, schema/data mutation,
deployment or application-server startup is authorized. Do not update other worktrees.

- Main base: 3f387f2191b870f8fab521a906e922d78854867b (local main, verified clean).
- Feature input: 072ee194 (codex/agent-onboarding), including its main-agent ancestry.
- Branch: codex/agent-onboarding-integration.
- Worktree: C:/Users/user/Keepintax/TaxMyself-agent-onboarding-integration.
- Feature worktree's untracked backend/journey-timings.local remains untouched.
- No remote refresh is claimed: this candidate targets the user's current local main.

Acceptance: preserve both parents' functionality; resolve all textual/semantic
conflicts; lockfiles support clean independent npm ci; shared-agent type/lint/tests
and build pass; focused Nest integration/security/report reads and Nest build pass;
focused Angular onboarding/admin/shared chat plus affected main features and production
build pass; inspect auto-merged reporting paths; document exact results and limitations.

## Merge resolution

The single textual conflict was frontend/package.json scripts.start. Kept the
feature's node scripts/start-local.js wrapper. Without ignored worktree overrides it
retains main's 4200/3000 defaults; with overrides it supports independent feature
ports. All dependency additions/lockfile updates from both parents are retained.
Auto-merged backend package files and report-review.service.ts require review/checks.

Local environment files were copied from primary main (backend/.env only existed).
Only missing AI settings were supplemented from the existing feature's ignored env;
primary DB configuration was preserved. Candidate origins include local 4205.
Ignored candidate ports: frontend 4205, backend 3005, onboarding enabled.
No secrets/env/dependencies/build output or test artifacts are tracked.

## Verification plan

1. Clean independent npm ci in backend, frontend and backend/agent.
2. Inspect both-parent auto-merges and the reporting read-only boundary.
3. Agent required checks; focused combined Nest/Angular checks and all three builds.
4. Verify main and feature refs/working trees remain unchanged; local candidate commits only.

Results and final candidate revision will be recorded below.

## Integrated tree and semantic review

Merge commit: 6c5d56e294df4593d411514802c2c65cfb445337.
Parents: 3f387f2191b870f8fab521a906e922d78854867b and
072ee194cbe62691efff213fcb7dc508cd277b4f. Verification began on the
identical staged executable tree and continued on this commit. The only later
edits are verification documentation.

Reviewed the conflict against both parents and both-parent diffs of the automatic
package/lockfile and ReportReviewService merges. Main's email retention checks
remain inside approval transactions, and its amount/date validation is retained.
The agent's readOnly preview skips classification refresh, inbox processing,
pairing and matching; the ordinary review retains those steps. Transaction-cache
confirmation writes remain atomic with expense approval. No additional accounting
algorithm or schema change was introduced to resolve this merge.

Two inherited extra blank lines at EOF were removed in routes-and-screens.md and
AI.features.md so the complete main-to-candidate diff passes git diff --check.
The candidate includes the full shared-agent ancestry (521 files vs main), not
only the final onboarding patch. Existing admin-only onboarding authorization,
shared profile tools and template Langfuse wiring are retained.

## Commands and results (2026-11-21)

All commands ran in this candidate's own independent dependency directories.

- backend, frontend, backend/agent: npm ci --no-audit --no-fund PASS (1176,
  1482 and 724 packages respectively); no tracked lockfile mutation.
- backend/agent: npm run typecheck PASS (Effect suggestions only).
- backend/agent: npm run check PASS, including formatting and lint.
- backend/agent: npm test: 376 passed, 22 skipped, 1 failed due to the unchanged
  5000ms Git-fixture timeout under concurrent compilation; 67 files passed,
  3 skipped, 1 failed. No application assertion failed.
- Affected case rerun: npx vitest run --project unit
  tests/evals/runner/eval-run-git-state.test.ts --maxWorkers=1 PASS (1 test).
  No timeout, assertion or implementation was changed. This is a full run plus
  a successful affected-case retry on the same executable tree, NOT a claim
  that one uninterrupted complete unit run passed.
- backend/agent: npm run build PASS.
- backend: npm run build PASS.
- backend: node --test scripts/local-onboarding-config.test.cjs
  scripts/local-webhook-proxy.test.js scripts/profile-startup.test.js PASS (13).
- root: node --test scripts/start-ai-dev.test.cjs PASS (3).
- frontend: node --max-old-space-size=6144 node_modules/@angular/cli/bin/ng.js
  test --watch=false --browsers=ChromeHeadless --progress=false --source-map=false
  --ts-config=tsconfig.onboarding-spec.json with the onboarding/*.spec.ts,
  dev-agent-chat.spec.ts, admin-panel.page.spec.ts and admin-route.guard.spec.ts
  includes PASS (41 tests).
- frontend: same headless command with ignored .test-tmp/tsconfig.integration.spec.json,
  extending tsconfig.spec.json with skipLibCheck and jasmine/node types; explicit
  includes dev-agent/*.spec.ts, integrations.service.spec.ts and
  gmail-integration.component.spec.ts PASS (30 tests). The transient tsconfig
  includes only those specs, src/**/*.d.ts, src/test.ts and src/polyfills.ts.
- Startup print-only checks: frontend/scripts/start-local.js --print-config
  returns 4205/3005 in this candidate; a copied script in an isolated scratch
  fixture without configuration returns main defaults 4200/3000 and localhost
  API. backend/scripts/start-watch.js --print-config returns 3005 with
  synchronize=false. No application server was launched.

The first backend Jest command used --testPathPattern containing agent-onboarding;
because that also matches the absolute worktree path it selected the entire suite.
That incomplete broad run was stopped and is NOT reported as passing. Replaced by
an explicit 39-file --runTestsByPath run, with a machine-readable JSON report.

## Limits and operational scope

No database mutation, migration, deployment, application-server startup, remote
fetch or paid model evaluation was performed. Live-DB suites need their explicit
test database settings and were intentionally not enabled. This candidate does
not replace manual testing of the integrated application. Before production,
apply/review inherited schema prerequisites through the approved deployment
process; this task introduced no new schema migration.

## Final verification

- Explicit Nest command: node node_modules/jest/bin/jest.js --runInBand
  --runTestsByPath <the 39 paths below> --json
  --outputFile=.test-tmp/integration-jest.json. PASS: 38 suites / 350 tests;
  1 suite / 14 tests skipped (onboarding live MySQL), 0 failed; 202.925 seconds.
  JSON success=true. The test selection was made from relative src paths,
  avoiding the absolute worktree-name match in the earlier stopped broad run.
- frontend: node --max-old-space-size=6144 node_modules/@angular/cli/bin/ng.js
  build --configuration=production --progress=false PASS; hash e15e91e408712adb,
  353455ms. Warnings: initial bundle 3.20MB exceeds the 2MB warning threshold,
  eight component SCSS warning budgets, CommonJS optimization warnings for
  @vercel/oidc, lodash, tesseract.js and exceljs. No budget threshold was changed.
- git diff --check main..HEAD and git show --check PASS.
- Primary main remains 3f387f2191b870f8fab521a906e922d78854867b and clean.
  Feature remains 072ee194cbe62691efff213fcb7dc508cd277b4f; its pre-existing
  untracked backend/journey-timings.local was untouched.
- Final follow-up commit changes this verification record only; no executable
  files changed after the tested merge. This is a local candidate only: no main
  integration and no push. User manual testing of this combination is still pending.
- Logs and JSON reports remain local/ignored; backend reports were relocated to
  root .test-tmp/backend-integration after execution. No artifacts are committed.

Explicit backend paths:

```text
src\agent-harness\agent-harness.controller.spec.ts
src\agent-harness\agent-harness.access.spec.ts
src\agent-harness\agent-domain.service.spec.ts
src\agent-harness\agent-classification.service.spec.ts
src\agent-harness\agent-books.service.spec.ts
src\agent-harness\agent-background-context.spec.ts
src\agent-onboarding\onboarding.service.spec.ts
src\agent-onboarding\onboarding.mysql.spec.ts
src\agent-onboarding\onboarding.domain.spec.ts
src\agent-onboarding\onboarding-admin.spec.ts
src\inbound-email\mailgun-signature.service.spec.ts
src\inbound-email\mailgun-inbound.controller.spec.ts
src\inbound-email\inbound-email-address.service.spec.ts
src\inbound-email\gmail-forwarding-verification.service.spec.ts
src\bookkeeping\pending-classification.spec.ts
src\billing\services\billing-receipt-email.spec.ts
src\smoke\smoke-email-verifier.spec.ts
src\documents\email-ai-outcome.spec.ts
src\reports\report-review-supplier-matching.spec.ts
src\reports\report-review-supplier-creation.spec.ts
src\reports\report-review-read-only.spec.ts
src\reports\report-review-identity-scope.spec.ts
src\reports\report-review-focus.spec.ts
src\reports\report-review-dockind.spec.ts
src\reports\report-review-currency.spec.ts
src\reports\report-review-classification.spec.ts
src\transactions\agent-classification-transaction.spec.ts
src\email-intake\email-protected-handoff.spec.ts
src\email-intake\email-processing.spec.ts
src\email-intake\email-outcome-persistence.spec.ts
src\email-intake\email-normal-mode.spec.ts
src\email-intake\email-intake.store.spec.ts
src\email-intake\email-intake-runs.spec.ts
src\email-intake\email-existing-result.spec.ts
src\integrations\utils\email-intake-decision.spec.ts
src\integrations\providers\composio-gmail.provider.spec.ts
src\integrations\services\composio-client.service.spec.ts
src\integrations\services\email-attachment-download.service.spec.ts
src\integrations\services\email-connections.service.spec.ts
```
