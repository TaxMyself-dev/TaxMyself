# PDF fixes - local main integration

- Status: `LOCAL_MAIN_READY_FOR_MANUAL_TEST`
- User explicitly approved local main integration only, with no push or production deployment.
- Original clean main: `b20c649946c7ebe8b81077a9025c7ef511eefe11`.
- Fonts: feature `cba5efb5` cherry-picked as `724d3b2f`.
- Preview canvas: feature `7db0be95` cherry-picked as `c21a5eac`.
- Verified executable main revision: `c21a5eac`.

## Scope and review

Only the two PDF correction commits were selected, rather than merging the test
branch. The user's existing onboarding changes remain ancestors of main. No
conflicts required semantic resolution. PDF renderer, fonts and preview source
files match the version the user personally validated in test. No database,
schema, accounting, signing-contract, production or credential changes.

## Mandatory port check before integration

Both checks were run before either cherry-pick and repeated afterward:

- `node backend/scripts/start-watch.js --print-config`: backend 3000, environment source, synchronize false.
- `node frontend/scripts/start-local.js --print-config`: frontend 4200, backend 3000, API `http://localhost:3000/`, main defaults.
- Inspected serve options, launchers, backend `.env` PORT and process overrides. No ignored worktree port override or shell PORT override applies to main. No configuration edits needed.
- Local PDF rendering uses installed Chromium; the existing signing token is present. Secret values were not logged and environment files were not changed.

## Verification on integrated main

- Backend `npm test -- --runInBand documents/pdf`: exit 0, 7 suites / 153 tests passed, 36.347 seconds.
- PDF service `node --test test/renderer.test.cjs test/service.test.cjs`: exit 0, 20 tests passed, 0 skipped.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.pdf-preview.spec.json --include=src/app/components/pdf-preview-dialog/pdf-preview-dialog.component.spec.ts --progress=false --karma-config=<temporary-main-port-9889-config>`: exit 0, 4 tests passed in Chrome Headless 157. Temporary config loads main's unchanged Karma config and selects port 9889. Passed before and after dependency repair.
- Backend `npm run build`: exit 0; packaged PDF assets contain both TTFs and no OTFs.
- PDF service `npm ci --prefer-offline --no-audit --no-fund`, then `npm run build`: both exit 0; dependencies installed independently in main's PDF-service package.
- Frontend `npm run build -- --configuration production`: final exit 0. The first invocation failed because main's local node_modules lacked `ai` and `@ai-sdk/angular`, already present in the existing lockfile. Repaired with `npm ci --prefer-offline --no-audit --no-fund` without modifying package manifests or lockfiles, then reran the frontend tests and build. Installed ai 7.0.148, @ai-sdk/angular 3.0.148; pdfjs-dist 4.7.76 and Angular 19.2.14 remained unchanged.
- Backend `node -r ts-node/register/transpile-only scripts/verify-document-pdf-compatibility.ts <local-artifacts>`: exit 0, original/copy in one and seven pages through actual local and standalone renderers. Independent pypdf checks passed for all eight PDFs: Type0/CIDFontType2 fonts embedded on every page and identical extracted text between renderers.
- No extra paid signing requests: the exact signing/PDF correction code was already tested in test and the user confirmed signed original/copy plus preview worked. Full repository tests were not run; checks were focused on the modified PDF modules and both applicable app builds.
- Windows, Node v24.13.0. Install engine warnings: PDF-service declares Node 22; frontend declares Node 20. No engine requirements or dependencies were weakened. The same PDF-service source had already passed Linux/Node 22.18 cloud build and smoke checks in test.
- Frontend build retains budget/CommonJS warnings in unrelated styles/dependencies. No build or focused test failures remain after repairing the local dependency installation.
- `git diff b20c6499..HEAD --check` and source diff review passed. No temporary artifacts, secrets, dependency directories or build outputs are committed.

## Delivery boundary

The completion documentation commit changes no executable input, so the evidence
above remains valid for the final local main. No git push, cloud access,
deployment, environment copy or full Nest application startup was performed in
this integration task. Manual testing of this current local main is pending;
the earlier test-environment confirmation does not authorize a future main push.
