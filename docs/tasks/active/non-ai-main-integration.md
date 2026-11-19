# Approved non-AI local main integration

- Status: `INTEGRATED_LOCAL` — verified executable tree; no push authorized.
- Date: 2026-11-15
- Manager: current Codex chat; no workers delegated.
- Integration branch: `codex/non-ai-main-integration`
- Original local main: `96adf4643e91ebdb4090259308d06c46d493e2eb`
- Refreshed origin/main: `66c11cbc` (preserve current billing fixes).

## Scope and acceptance

Elazar explicitly requested merging the remaining changes except AI, after
excluding legal consent, WhatsApp support and PDF timing diagnostics. Integrate
subscription pricing (backend and UI), new personal/subscription settings,
browser update banner, and guarded background Enter login. The old uncommitted
PDF renderer experiment is not part of this integration. AI/demo branches stay
outside main. No remote push, deployment, provider calls, or database changes.

- Preserve existing local-main commits and current remote-main fixes.
- Keep original feature worktrees and their local edits intact.
- Include the settings page's local family-heading correction; exclude local
  frontend start port and API port configuration.
- Resolve pricing conflicts without losing multi-period recovery, hosted
  initial-checkout resume, payer-profile validation, or no-charge activation.
- Run combined mocked billing/signup/admin-guard regressions and Nest build.
- Run focused settings, pricing, login and PWA tests and Angular production build.
- Fast-forward local main only after verification, preserving untracked local files.
- Record exact revisions, commands, results and limitations here.

## Setup

The original main Git index began with zero bytes and was unreadable. Preserved
it as `.git/index.corrupt-backup-20261115`, reconstructed an alternate index from
HEAD, and confirmed no tracked working-file changes before replacing the index.
Only existing untracked `.codex-remote-attachments/` remains in the main checkout.
No tracked files were changed by index repair.

Created a separate worktree and copied ignored `backend/.env` without displaying
its contents. Backend `npm ci --no-audit --no-fund` succeeded. Frontend `npm ci`
failed on the existing missing `encoding` lock entry; installing independently
without changing the tracked lockfile. No dependency directories are shared.

## Review and integration

- Refreshed origin/main at `66c11cbc` was merged as `aa688230`.
- Pricing branch merged as `301b2a29`. Conflict resolution preserves optional
  manual-charge dependencies and methods, adds the pricing methods separately,
  keeps payer-profile imports and checks, retains the ordered full debt range
  while reading soft-deleted historical plans, and preserves both cumulative
  SQL additions. Checkout handles APPLIED alongside REDIRECT/PROCESSING/COMPLETED.
- Settings branch merged as `8f864e0c`, including its existing unsaved spouse
  heading correction. Source worktree files remain untouched; local ports were
  not copied. Added the new topic to the root map.
- Browser update banner merged as `199822fa`.
- Guarded background Enter login merged as `7972e25b`.
- Original feature source and task documentation reviewed; topic AGENTS.md
  changes retained under docs-sync-on-commit. No dependency manifest/lockfile or
  tracked environment configuration changes.

## Verification

Backend source at `301b2a29` is byte-identical to `7972e25b` (`git diff
301b2a29 HEAD -- backend` is empty); this reuses the same backend test evidence,
not a claim that the full commands were rerun at every merge commit.

Commands from `backend/`:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testPathPattern 'billing|users/(users.service|users.signup-phone).spec|guards/(subscription.guard|admin-endpoints-security).spec' --json --outputFile=.test-tmp/integration-billing-results.json
npm.cmd run build
```

- Jest: PASS, exit 0, 51 suites / 661 tests, 160.634 seconds.
- Nest build: PASS, exit 0.
- An initial attempt through `npm test` did not execute because Windows cmd
  interpreted the regex pipe. Replaced it with the direct Jest command above.
- All tests use mocks; no backend startup, database migration, provider charge,
  production or cloud operation was performed.

Frontend verification at `7972e25b` uses cached Node **20.20.2**, verified by
`--version`, and `NG_BUILD_MAX_WORKERS=1`. Independent installation initially
resolved pdfjs-dist 4.10.38; restored the lockfile's 4.7.76 with
`npm.cmd install --no-save --package-lock=false --no-audit --no-fund pdfjs-dist@4.7.76`.
Angular core 19.2.25, CLI 19.2.14 and TypeScript 5.5.4. Manifests and lockfiles
remain unchanged. Node 24 emitted the existing engine warning during installation.

Commands from `frontend/` (the `node` executable below is the cached 20.20.2
binary at `C:/Users/user/AppData/Local/npm-cache/_npx/185e25162edaacfb/node_modules/node/bin/node.exe`):

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --progress=false --karma-config=.angular/non-ai-integration.karma.cjs --ts-config=.angular/non-ai-integration.tsconfig.json --include=src/app/pages/settings-new/*.spec.ts --include=src/app/pages/settings/my-subscription-tab/*.spec.ts --include=src/app/pages/settings/settings-access.policy.spec.ts --include=src/app/pages/settings/settings-source-deletion.spec.ts --include=src/app/pages/settings/settings-shaam-connection.spec.ts --include=src/app/pages/settings/settings-banking-row-actions.spec.ts --include=src/app/shared/admin-billing/subscriptions/billing-subscriptions*.spec.ts --include=src/app/shared/admin-billing/plans/billing-plans.component.spec.ts --include=src/app/services/admin-billing.pricing.spec.ts --include=src/app/pages/billing/billing-plans.page.spec.ts --include=src/app/pages/billing/billing-recovery.page.spec.ts --include=src/app/services/billing-state.service.spec.ts --include=src/app/components/button/button.component.spec.ts --include=src/app/pages/login/login.page.spec.ts --include=src/app/components/pwa-banners/pwa-banners.component.spec.ts
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

The ignored temporary tsconfig extends tsconfig.spec.json, limits includes to the
listed specs/declarations, enables Jasmine/Node types and skipLibCheck, retaining
the inherited test.ts/polyfills.ts. Karma extends the repository config with
port 9898 and dots reporting. No application compiler/template checking is disabled.

- ChromeHeadless 157: 141 executed, 140 passed, 1 failed; exit 1.
- All 132 selected tests outside the unchanged nine-test recovery suite passed.
- Recovery failure: `offers server-owned continuation for a resumable pending
  CardCom checkout` calls `pay()` with no HTTP mock response and times out.
  Main `96adf464` and the integrated tree have identical production/spec blobs
  (`ed0a51f4` / `db1bd3d3`), unchanged button code and environment. The billing
  state service is mocked by this spec. Separate reproduction using these
  unchanged original-main files also executed 9 tests: 8 passed, the same test
  failed with the same timeout/open POST. This is a baseline recovery failure,
  not a passing broad suite or a claim of a full original-main application run.
- Baseline command: same cached Node and Karma config as above, with
  `--ts-config=.angular/non-ai-recovery-baseline.tsconfig.json` and only
  `--include=src/app/pages/billing/billing-recovery.page.spec.ts`. That ignored
  tsconfig extends the same base and includes only the unchanged recovery spec
  and declarations. No source replacement, assertion weakening or timeout
  increase was used to obtain a pass. The unrelated failure was left unchanged.
- Angular production build: PASS, exit 0, hash `1020e7742d34c3e1`, 130762 ms.
  Existing generic-table/admin-guide/doc-create/my-account/report-review/old
  settings style warnings and lodash/exceljs CommonJS warnings remain. The
  incoming settings-new stylesheet is 6.30 kB versus its 6 kB warning budget;
  initial bundle is 3.20 MB versus the 2 MB warning budget. No limits changed.
- Integration commits and final diff pass whitespace checks. Excluded AI/demo,
  legal-consent, WhatsApp-support and PDF-timing heads are not ancestors of the
  integration branch. Source branches/worktrees were not modified.
- Full application suites, authenticated account/provider actions and manual
  visual/persistence acceptance were not run.

Logs remain ignored in the integration worktree: `.test-tmp/backend-verification/`
(moved from backend/.test-tmp after execution), and frontend/.angular/
non-ai-integration-tests.log, non-ai-integration-build.log and
non-ai-recovery-baseline.log. Topic documentation already covers the executable
changes. Only delivery documentation changed after `7972e25b`; passing evidence
is reused while its source inputs remain unchanged.

## Delivery

Elazar explicitly authorized local-main integration in this chat. Deliver by
fast-forward from original main `96adf464` to this verified integration branch,
preserving untracked `.codex-remote-attachments/`. Refreshed origin/main remained
`66c11cbc` at the final checkpoint. No deployment or database/provider operation.
The original corrupt index backup remains under main's .git directory.

Local main is the manual-test target. Push remains forbidden until Elazar
personally tests this exact main revision and explicitly approves push.
