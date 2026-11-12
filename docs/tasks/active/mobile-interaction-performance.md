# Mobile interaction performance on POCO F6

- Status: `READY_FOR_PHONE_TEST`
- Task manager / worker: Codex (single agent)
- Worktree: C:/Users/user/Keepintax/TaxMyself-mobile-interaction-performance
- Branch: codex/mobile-interaction-performance
- Base commit: 24b3b56bb6474ddcffc544adf2fcbe95741ad7ee (current local main; origin/main verified as ancestor)

## Business outcome

Home buttons respond promptly on the physical POCO F6 with many mobile transaction cards.

## Acceptance criteria

- Closed row menus register no global dismissal listeners; open menus still close on outside pointer/click/focus, Escape, scroll and resize, with cleanup on destruction.
- Unchanged row-action lists retain identity without caching stale visibility, callbacks or loading decisions.
- Focused regression tests and Angular production build pass.
- Optimized local frontend uses DEV backend and is reachable on the physical phone via USB; no deployment or main integration.

## Scope and constraints

- Frontend row-menu lifecycle and stable row-action inputs only. No pagination/UX, backend, accounting, schema, authorization or production-data changes.
- Preserve unrelated files and existing action execution guards.
- Required reading: root AGENTS.md, coordination workflow/authority/quality gates/lessons, generic-table AGENTS.md.
- User explicitly approved implementation and local USB testing; main integration, push and deployment are not authorized.

## Handoff

- Result: implementation and automated verification complete, local USB site ready; physical response comparison awaits user login.
- Risks/manual checks: physical-phone response comparison and DEV login on localhost.


## Verification evidence (final source)

- Base: 24b3b56bb6474ddcffc544adf2fcbe95741ad7ee. No main integration or remote push.
- Node v24.13.0/npm 11.6.2 emitted the repository Node ^20.11.1 engine warning.
- Independent dependencies installed in this worktree; no node_modules sharing.
  npm ci and npm ci --legacy-peer-deps were blocked by existing missing encoding/
  peer lock metadata. An initial no-lock install selected incompatible newer PDF
  declarations, so its production build failed. This was corrected by consulting
  the existing lock (npm install --package-lock-only --ignore-scripts --no-audit
  --no-fund, then npm install --no-save --no-audit --no-fund). The original tracked
  package-lock.json was restored byte-for-byte from Git before final verification.
  Installed PDF 4.7.76, Angular/core and build-angular 19.2.14, TypeScript 5.5.4
  match the original lock. No package.json/package-lock.json changes are included.
- Final command from frontend:

  npm.cmd test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.table-actions.spec.json --include=src/app/components/generic-table/*.spec.ts --include=src/app/components/table-row-actions-menu/*.spec.ts --progress=false --karma-config=C:/Users/user/Keepintax/TaxMyself/.codex-remote-attachments/poco-karma.cjs

  Result: 50 executed, 49 passed, 1 pre-existing consumer failure. All 39 changed
  component/shared-policy scope tests passed. The separate consumer set has 11
  tests, 10 passed, 1 failed. The failing test is "keeps both allocation actions
  on pending tax invoices without a file": IncomesPage.confirmResumeAutomaticAllocation
  expects a confirmationService absent from its prototype-only fixture.
  Baseline was rerun via temporary original generic-table/menu source from the
  exact base commit, then feature source restored automatically:

  node C:/Users/user/Keepintax/TaxMyself/.codex-remote-attachments/poco-baseline-consumer.cjs

  That runs node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.table-actions.spec.json --include=src/app/components/generic-table/table-action-consumers.spec.ts --progress=false --karma-config=C:/Users/user/Keepintax/TaxMyself/.codex-remote-attachments/poco-karma.cjs

  Baseline result: same 1 failure / 11 executed. No unrelated fixture/accounting change.
- Final optimized DEV build (production mode/optimization, DEV backend, no local SW):

  npm.cmd run build -- --configuration dev --service-worker=false --progress=false

  PASS, exit 0, build hash 6766569f60509980, 118659 ms, initial bundle 3.20 MB.
  Nonfatal existing-style budget and CommonJS warnings. Application-wide unrelated
  test suites and backend tests were not run (frontend-only scoped change).
- git diff --check passed; package files unchanged; backend/.env, frontend/node_modules
  and frontend/dist verified ignored. No schema, production data, accounting,
  authorization or external API contract impact.

## Local phone setup

- Optimized output: frontend/dist/app. Served only on host 127.0.0.1:4201 by the
  temporary serve-poco-dev.cjs helper outside tracked feature files.
- ADB physical device: 98284e26, POCO F6 model 24069PC21G.
- adb -s 98284e26 reverse tcp:4201 tcp:4201 established and listed successfully.
- Opened Chrome via adb shell am start -a android.intent.action.VIEW -d http://localhost:4201 -p com.android.chrome.
- Verified through CDP on phone tab 4012: http://localhost:4201/login, visible,
  document.readyState complete, viewport 388x751, rendered password input,
  main.158045e3a2d8778f.js loaded, no controlling service worker.
- Bundle verified contains DEV backend URL and both fix mechanisms. Static server
  sends X-Keepintax-Local-Test: mobile-interaction-performance and Cache-Control: no-store.
- Authenticated local-origin backend connectivity and performance improvement
  remain manual checks after DEV login. An optional unauthenticated host CORS
  preflight did not complete and was stopped; it is not counted as passing.
- User: keep USB connected, log into DEV at http://localhost:4201, then repeat
  Home add-expense menu and create-document navigation with the same transaction
  list. No document issuance, save or production mutation is required.
- Temporary server is intentionally left running for the requested manual test.
