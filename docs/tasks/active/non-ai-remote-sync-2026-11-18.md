# Preserve local features while syncing current remote main

- Status: `INTEGRATED_LOCAL` — no remote push or deployment authorized.
- Date: 2026-11-18
- Manager: current Codex chat, single agent.
- Existing worktree/branch: TaxMyself-non-ai-main-integration /
  `codex/non-ai-main-integration`.
- Initial local main: `05a87b662ef87dbb214f1745285091425ba6c45b`.
- Refreshed remote main: `11c829b2`.

## Authorization and acceptance

Elazar wants to deploy and requested alignment with remote. Preserve all four
previously integrated non-AI features and the mobile-table performance fix,
integrate current remote updates in isolation, verify the combined code, and
fast-forward local main. No reset, history rewrite, remote push or deployment.
Push still requires the owner's personal test of the resulting main revision
and explicit push approval under his personal AGENTS.md gate.

- Preserve local features and ignored environments/untracked files.
- Include KT-113/114 checkout-resolution safety and KT-115 deferred allocation
  accounting from current origin/main.
- Preserve local LIVE/FROZEN/CUSTOM pricing, zero-price activation and current
  payment recovery while resolving checkout imports.
- Run a bounded diagnostic on checkout/pricing/documents first, then combined
  billing/document backend regressions and affected frontend suites/builds.
- Record exact commands, revisions, failures/skips and final local state.
- No live provider, database, schema, production or cloud operation.

## Setup and review

Initial state: 31 local-only and 9 remote-only commits after fetch. Local tracked
files were clean, with only existing untracked .codex-remote-attachments/.
Continued the existing clean integration worktree with its independent installed
dependencies and ignored environment; no environment overwritten or dependency
tree shared. Remote changes do not alter package manifests or lockfiles.

The only textual conflict is the billing service import block. Keep both local
zero-price/date helpers and the new hosted-completion service. Review automatic
merge paths for preservation of APPLIED checkout status and pricing fingerprints.
Remote KT-115 posts pending-allocation journals at initial persistence and reuses
their link at finalization; mappings, amounts, thresholds and schema stay unchanged.
Existing topic documentation and the master redesign plan govern this behavior.

## Verification

Reviewed merge commit: `5d55139097e4c0d3a46a6f0f5596dfe109d049c2`.
All executable checks ran on its exact code before committing; only this task
record changes afterwards. Existing topic AGENTS.md updates were retained and
reviewed under docs-sync-on-commit. No new source fixes or test changes were made.

Backend commands from `backend/`, using Node 24.13.0 and independently installed
dependencies already owned by this worktree:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testPathPattern 'billing-checkout-resolution|pricing-policy|documents-draft-issuance'
node node_modules/jest/bin/jest.js --runInBand --testPathPattern 'billing|documents/(documents-journal.service|documents-draft-issuance).spec|users/(users.service|users.signup-phone).spec|guards/(subscription.guard|admin-endpoints-security).spec' --json --outputFile=../.test-tmp/remote-sync-backend-results.json
npm.cmd run build
```

- Diagnostic: PASS, 3 suites / 20 tests, exit 0, 61.394 seconds.
- Combined: 53 suites passed / 1 failed; 688 tests passed / 1 failed out of
  689, exit 1, 221.941 seconds. This is not a passing broad suite.
- Nest build: PASS, exit 0.

### Exact remote baseline reproduction

The sole failure is BillingReconciliationService's case `hosted result is still
pending (no transaction)`: its mocked ResponseCode=500 contains the matching
checkout identity but no transaction. The remote KT-114 implementation now
classifies that correlated no-charge result as DECLINED; this older expectation
still requires UNKNOWN and the five-minute retry. No assertions or financial
behavior were changed to make it pass.

Exported **672 exact origin/main TypeScript/JSON blobs** from `11c829b2` through
`git ls-tree -rz` and `git cat-file --batch`, verified every blob SHA-1, and ran
the failing case using that source snapshot in the same worktree. The snapshot
used its original package Jest configuration and tsconfig; only the absolute
rootDir and ts-jest paths were redirected. No other worktree dependencies were
shared, and no source in the application was replaced.

Command from the worktree root:

```powershell
node backend/node_modules/jest/bin/jest.js --config .test-tmp/remote-baseline.jest.json --runInBand --testPathPattern billing-reconciliation.service.spec --testNamePattern 'hosted result is still pending'
```

Result: the **same failure** against exact remote source; 1 failed, 13 skipped,
49.906 seconds, exit 1. Not a full remote suite. Early Windows archive/Python
preparation attempts and the snapshot initially hidden by Jest's node_modules
ignore did not execute tests; the final direct-Git export avoided those issues.

### Frontend

Used verified cached Node **20.20.2** at
`C:/Users/user/AppData/Local/npm-cache/_npx/185e25162edaacfb/node_modules/node/bin/node.exe`,
with `NG_BUILD_MAX_WORKERS=1`. Dependencies/manifests/lockfiles unchanged.

From `frontend/`, the final test command was:

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --progress=false --karma-config=.angular/non-ai-integration.karma.cjs --ts-config=.angular/non-ai-remote-sync.tsconfig.json --include=src/app/pages/settings-new/*.spec.ts --include=src/app/pages/settings/my-subscription-tab/*.spec.ts --include=src/app/pages/settings/settings-access.policy.spec.ts --include=src/app/pages/settings/settings-source-deletion.spec.ts --include=src/app/pages/settings/settings-shaam-connection.spec.ts --include=src/app/pages/settings/settings-banking-row-actions.spec.ts --include=src/app/shared/admin-billing/subscriptions/billing-subscriptions*.spec.ts --include=src/app/shared/admin-billing/plans/billing-plans.component.spec.ts --include=src/app/services/admin-billing.pricing.spec.ts --include=src/app/pages/billing/billing-plans.page.spec.ts --include=src/app/pages/billing/billing-recovery.page.spec.ts --include=src/app/pages/billing/billing-payment-status.page.spec.ts --include=src/app/shared/guard/billing.guard.spec.ts --include=src/app/services/billing-state.service.spec.ts --include=src/app/components/button/button.component.spec.ts --include=src/app/pages/login/login.page.spec.ts --include=src/app/components/pwa-banners/pwa-banners.component.spec.ts --include=src/app/components/generic-table/*.spec.ts --include=src/app/components/table-row-actions-menu/*.spec.ts --include=src/app/pages/book-keeping/incomes/incomes-shaam-confirmation.spec.ts --include=src/app/pages/doc-create/doc-create-request.spec.ts --include=src/app/pages/doc-create/doc-create-discount-audit.spec.ts
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

- ChromeHeadless 157: **239/239 passed**, exit 0. Includes local feature,
  mobile-table performance, checkout routing/status, allocation and discount
  regressions. The previously documented recovery failure now passes with
  remote's pendingPayment guard.
- The ignored focused tsconfig extends tsconfig.spec.json and limits includes
  to those specs/declarations, with Jasmine/Node types and skipLibCheck. Karma
  extends the original config on isolated port 9898. No app checking disabled.
- Initial doc-create wildcard selection failed compilation on the unchanged
  legacy scaffold's removed Angular `async` import. No tests executed in that
  attempt. Final selection uses the repository's existing request/discount
  focused scopes; legacy scaffolds and full application suite were not run.
- Production build: PASS, exit 0, hash **feda489648a6f586**, 95848 ms. Existing
  style/initial-bundle budget and lodash/exceljs CommonJS warnings remain. No
  thresholds changed.

Logs remain ignored under `.test-tmp/remote-sync-*`,
`.test-tmp/remote-baseline-reconciliation.log`, and
`frontend/.angular/non-ai-remote-sync-*`. The baseline source directory is moved
from backend/.test-tmp into the root ignored evidence directory after execution.

## Delivery and limits

Final remote refresh remained `11c829b252fdfe9655af3893e44c756901b3369b` and is an
ancestor of the merge. Local main is fast-forwarded from `05a87b66` to the
verified integration after committing this evidence. Preserve untracked
`.codex-remote-attachments/`; retain feature worktrees. No reset/history rewrite.

Local feature/pricing/phone-performance changes remain included. AI/demo, legal
consent, WhatsApp support and PDF-timing branches remain excluded. No source,
schema, database/provider access, cloud operation or production deployment beyond
the exact remote changes was performed; unit tests use mocks. Live CardCom and
authenticated manual UI/issuance checks were not run. The known upstream failed
reconciliation expectation is recorded rather than presented as passing.

Remote does **not** yet contain the local features. No push performed: owner
must personally test the delivered local main revision and explicitly authorize
push under his personal AGENTS.md gate before GitHub can be aligned to it.
