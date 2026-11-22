# Reconcile local main with GitHub main

- Status: `READY_FOR_REVIEW`
- Task manager: Codex
- Worker: same chat; no delegated agents
- Branch: `codex/main-remote-reconcile`
- Base commit: local main `5d405a014aded6995c4c4bf987af894f275eada8`
- Remote input: `82446400227ee6e5ed8751eafc2eab1656c4161c`
- Merge base: `ea5ba2b30590d7f6ff490d6537addb92740a42b0`

## Business outcome

Prepare one reviewable candidate containing both local feature work and the
GitHub changes to SHAAM allocation and report defaults, without updating main
or any remote branch.

## Acceptance criteria

- [x] Both recorded input commits are ancestors of the candidate.
- [x] Review the automatically combined document/report changes and resolve
      any textual or semantic conflicts while preserving both inputs.
- [x] Run isolated frontend allocation, report-default/navigation, document
      analysis and affected-page tests, followed by the production build.
- [x] Add runtime coverage for annual P&L defaults and preserving an explicit
      review-return period, the main overlapping report behavior.
- [x] Record exact commands, results, skips and runtime limitations.
- [x] Keep primary main unchanged and clean; do not push or deploy.

## Scope and constraints

- This is an integration candidate, not approval for main integration or push.
- No business, accounting calculation, schema, credential, cloud or production
  change is authorized. No live providers or databases are needed.
- Preserve local-only source features and remote-only delivery changes.
- Keep inherited governance changes from origin/main intact; task-specific
  reporting belongs only in this task file.
- Risk tier: component behavior plus shared report period/navigation helpers.
- Backend/package files are unchanged from the tested local-main input; do not
  install backend/agent dependencies or rerun unrelated backend suites merely
  because this branch contains their history.
- Use a separate dependency installation and bounded Angular worker count.

## Initial review

Git reports 132 local-only and 19 remote-only commits. The isolated merge
completed without textual conflicts. It automatically combined doc-create
documentation and the P&L/VAT pages; those files require semantic review.
Primary main was clean. Ignored backend environment was copied without
overwriting any existing file or displaying secrets. No app was started.

## Verification and handoff

- `npm ci --no-audit --no-fund --prefer-offline` in frontend: passed, 1,483
  packages installed in approximately five minutes. The lockfile was not
  changed. Actual runtime is Node 24.13.0 / npm 11.6.2; npm warns that the
  existing frontend engine field requests Node ^20.11.1. This task does not
  change that field or claim verification under Node 20.
- Initial runner configuration rejected the unsupported Angular CLI `--port`
  option before executing tests. Replaced it with a task-specific Karma config.
- First executable run: 72 tests, 63 passed and 9 VAT-page tests failed during
  TestBed construction because DriveDocsService lacked a mock and attempted
  HttpClient injection. Added the missing mock; application code was not
  changed. This is not labeled a proven baseline failure because no separate
  base run was performed.
- Chrome initially failed capture and profile-lock retries, then connected and
  completed that run. The final run uses the installed Edge executable through
  ChromeHeadless with a worktree-local TEMP/TMP directory, a 120-second capture
  timeout and no launcher retries. No browser security bypass flags were used.
- Final focused run: **72 of 72 SUCCESS**, Edge Headless 157 on Windows,
  exit 0. All five new integration cases passed along with existing allocation,
  preview-locking, discount, period-navigation, eligibility and queue-polling
  coverage. Mock error-path console output is expected; no live provider ran.
- The final run exercised the complete selected set on the final executable
  tree, not a mixture of partial passing runs. Subsequent edits are task/topic
  documentation only.
- Relative Markdown links: 18 changed Markdown files checked, 2 local links,
  zero missing targets. `git diff --check` passed.
- Primary main remains `5d405a014aded6995c4c4bf987af894f275eada8` and clean.
  Backend and agent source match that input exactly; no backend checks were
  rerun because the remote input changes only frontend behavior/docs and adds
  no backend dependency/API/schema changes.
- Production build: exit 0, hash `d365c66799b017d9`, 266,916 ms,
  completed 2026-11-22T08:56:06.624Z. Warnings: eight component stylesheet
  budgets, initial bundle 3.21 MB versus 2 MB budget, and CommonJS dependencies
  @vercel/oidc, lodash, tesseract.js and exceljs. These are warnings, not errors;
  no separate baseline build was run to classify them as baseline warnings.
- Final history checks require both recorded inputs as ancestors and exactly
  those two merge parents. No main integration, push or deployment is authorized.
  Logs are ignored frontend/*.log files.
- Manual browser flows and live provider/E2E checks were not run. Before main
  integration, review the candidate and manually exercise allocation dialogs,
  SHAAM loading feedback and report default/review-return periods.

### Reproduction commands

From `frontend`, after the isolated `npm ci` above:

```powershell
$env:CI = 'true'
$env:NG_BUILD_MAX_WORKERS = '2'
$env:CHROME_BIN = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$reconcileTemp = Join-Path (Get-Location) '.angular/reconcile-browser-temp'
New-Item -ItemType Directory -Force -Path $reconcileTemp | Out-Null
$env:TEMP = $reconcileTemp
$env:TMP = $reconcileTemp
$specs = (Get-Content tsconfig.main-remote-reconcile.spec.json -Raw |
  ConvertFrom-Json).include | Where-Object { $_ -like '*.spec.ts' }
$testArgs = @(
  'node_modules/@angular/cli/bin/ng.js', 'test',
  '--watch=false', '--browsers=ChromeHeadless',
  '--ts-config=tsconfig.main-remote-reconcile.spec.json',
  '--karma-config=karma.main-remote-reconcile.conf.cjs',
  '--progress=false', '--source-map=false', '--reporters=dots'
) + @($specs | ForEach-Object { "--include=$_" })
node @testArgs
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

The test configuration includes exactly 12 spec files. The Chrome launcher uses
the Edge executable selected by CHROME_BIN; it is not a claim of verification
on Google Chrome in the final run. The production build is run after the test
process exits to avoid concurrent compiler memory pressure.
