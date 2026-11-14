# Browser update notification

- Status: `TEST_INTEGRATED`
- Branch: `codex/browser-update-banner`
- Base commit: `96adf4643e91ebdb4090259308d06c46d493e2eb` (verified local main).
- origin/main refreshed to eb68742c; it has separate billing work and diverges
  from local main. No changes integrated into either protected branch.

## Acceptance criteria

- Existing new-version banner and Update button appear in browser tabs as well
  as installed apps once the service worker finishes downloading the update.
- No automatic reload/activation, and no banner for an incomplete download.
- Clicking Update uses the existing activation/reload handler and disables the
  button while running. Existing installed-app and disabled-SW behavior retained.
- Reuse current Hebrew text and banner layout; no schema, backend or API changes.

## Verification and delivery

Focused tests: npm test -- --watch=false --progress=false --browsers=ChromeHeadless
--karma-config=karma.pwa-update.conf.js
--include=src/app/components/pwa-banners/pwa-banners.component.spec.ts
--ts-config=tsconfig.pwa-update.spec.json — PASS, 4 tests (Chrome Headless 157).

First build: npm run build -- --configuration production --progress=false
failed via native Node 24 crash (npm debug exit -1073741819 / 0xC0000005),
with no TypeScript/Angular compilation diagnostic. Runtime differs from the
declared Node ^20.11.1 requirement. Retry uses isolated node@20.19.0 through
npm exec, without global/runtime/package-lock changes.
Supported-runtime command: npm exec --yes --package=node@20.19.0 -- node
node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
— PASS, exit 0; build hash 8f649e7ac44f7a80, reported build time 45568 ms.
Warnings: SCSS budgets in generic-table, admin guides, doc-create, my-account,
report-review and settings; initial bundle 3.20 MB versus warning budget 2 MB;
lodash/exceljs CommonJS optimization warnings. No warnings in changed styles
(no stylesheet modifications). These warnings were not treated as failures.
No live two-release service-worker deployment performed; behavior validated
with real Angular component rendering and simulated SwUpdate events.
git diff --check: PASS. No executable changes after the passing tests/build.
Initial test CLI attempt used unsupported --port=9893 and did not execute tests;
moved the isolated port into karma.pwa-update.conf.js and reran successfully.
npm ci --prefix frontend --no-audit --no-fund passed (1467 packages). Warnings:
Node 24.13.0/npm 11.6.2 versus declared Node ^20.11.1, legacy dependency notices,
and non-fatal EPERM cleanup warning. No lockfile/package changes.
Ignored backend environment copied from primary; tracked landing environment
retained. No credentials or generated artifacts are included.

Existing visibility checks/15-minute throttle and click activation are retained.
This banner appears after the worker detects/downloads a new version; it does
not force background polling or automatic reloads. Existing clients must first
load this deployed change (possibly one manual refresh) to enable the prompt.
Elazar explicitly approved test integration and test push. Main integration/push
remain unauthorized for this feature. No cloud deployment requested.

## Test integration verification

- Applied feature afb8888b onto test base 298c5c25 without conflicts.
- Used npm exec --yes --package=node@20.19.0 -- node
  node_modules/@angular/cli/bin/ng.js test with the same focused options above:
  PASS, 4 tests in Chrome Headless 157.
- npm exec --yes --package=node@20.19.0 -- node
  node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false:
  PASS, hash b238b730eeffdd58, reported build time 177748 ms.
- Same SCSS/initial-bundle/CommonJS warning categories as the feature build.
- git diff --cached --check: PASS. No executable changes after verification.
- Only test will be pushed. Local main remains 96adf464; no deployment performed.
