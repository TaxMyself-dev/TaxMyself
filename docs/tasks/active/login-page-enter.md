# Page-wide guarded Enter login

- Status: `TEST_INTEGRATED`
- Branch: `codex/login-page-enter`
- Base: `96adf4643e91ebdb4090259308d06c46d493e2eb` (current local main).

## Acceptance criteria

- Enter from a noninteractive area of active /login submits valid credentials.
- Keep native input/form/button Enter behavior; no duplicate submission or
  hijacking of Google, password reset, links, editors or other focused actions.
- Block invalid/pending form, active login/reset request, registration/email/MFA
  dialogs, password-reset mode and any other visible modal.
- Ignore held keys, composition, modifier shortcuts and already-handled events.
- Ignore cached login pages while another route is active.
- Tests, production build and nearest topic documentation completed before commit.

## Scope and approval

Frontend login only. No backend/schema/accounting changes. Elazar explicitly
approved test integration, test push and frontend-only test deployment.
Main integration/push remain unauthorized for this feature.

## Verification evidence

- Independent install: npm exec --yes --package=node@20.19.0 -- node
  "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" ci --prefix frontend
  --no-audit --no-fund: PASS, 1496 packages in 3 minutes; legacy dependency warnings.
- Ignored backend/.env copied from primary; tracked landing env retained.
- Focused command from frontend:
  npm exec --yes --package=node@20.19.0 -- node node_modules/@angular/cli/bin/ng.js test
  --watch=false --progress=false --browsers=ChromeHeadless
  --karma-config=.angular/login-page-enter.karma.cjs --ts-config=tsconfig.login-check.json
  --include=src/app/components/button/button.component.spec.ts
  --include=src/app/pages/login/login.page.spec.ts
- Final result: 29 PASS, exit 0, Chrome Headless 157. Includes native form/button
  submission tests and 20 new guarded-background-Enter cases.
- Two initial full focused runs reported 28 passing / 1 failing visibility test.
  A bounded modal-only diagnostic confirmed Ionic's unhydrated test body had
  display:none (connected open dialog, zero layout rectangles). The fixture now
  sets/restores html.hydrated and tests a real open/closed native dialog, keeping
  its positive visibility assertion and the application modal guard unchanged.
  The diagnostic-only runner had one failing spec, 22 skipped; not a passing run.
- One initial broad text insertion also matched old commented login code; caught
  in diff review and corrected to one handler before compilation.
- The ignored temporary Karma config extends ../karma.conf.js, sets port 9895,
  ChromeHeadless, singleRun:true and autoWatch:false; no sandbox bypass flags.
- First production build through npm exec/node@20.19.0 failed with native
  exit -1073741819 (0xC0000005), no compilation diagnostic. The npm wrapper
  itself uses system Node 24; no cause is asserted beyond this native failure.
- Retrying directly with the verified cached Node 20.19.0 executable and
  NG_BUILD_MAX_WORKERS=2 (supported by the installed Angular builder).
  Same command target: node node_modules/@angular/cli/bin/ng.js build
  --configuration production --progress=false; output in ignored
  frontend/.angular/login-page-enter-build.log. This second attempt also failed
  with native exit -1073741819 and no compilation diagnostic.
- Final production build: direct cached Node 20.20.2 executable, verified with
  --version, NG_BUILD_MAX_WORKERS=2, then node node_modules/@angular/cli/bin/ng.js
  build --configuration production --progress=true. PASS, exit 0; hash
  30f294ffb7194ca6, reported build time 526866 ms. Full output retained only in
  ignored frontend/.angular/login-page-enter-build-patched.log.
- Registry query identified 20.20.2 as the compatible current Node 20 patch.
  No global runtime, package manifest or lockfile modifications.
- Memory diagnostics found <1 GB free on the 24 GB host during parallel work;
  later >5 GB became free and the final build completed. Memory pressure is a
  possible contributor, not a proven cause. No other tasks/processes stopped.
- Nonfatal build warnings: existing stylesheet budget categories in generic
  table/admin guides/doc-create/my-account/report-review/settings; initial
  bundle 3.20 MB versus warning budget 2 MB; lodash/exceljs CommonJS warnings.
  No styles changed. Known baseline failures: none in the focused final checks.
- The 29 passing tests ran on Node 20.19.0; production build ran on 20.20.2.
  Same executable source; no claim that tests reran under the latter runtime.
- git diff --check: PASS. No executable edits after passing tests/build.
- No actual authentication calls or remote writes made by these tests.
- Backend tests/broad application suites not run: frontend-login-only scope.
- Documentation updated: frontend/src/app/pages/login/AGENTS.md.

## Approved test delivery

- Applied feature 7a0abe9b to test base 5aa096be without conflicts.
- Combined focused verification on integrated test: direct Node 20.20.2, ng test
  --watch=false --progress=false --browsers=ChromeHeadless
  --karma-config=karma.pwa-update.conf.js
  --ts-config=.angular/tsconfig.login-enter-integration.json
  --include=src/app/components/button/button.component.spec.ts
  --include=src/app/pages/login/login.page.spec.ts
  --include=src/app/components/pwa-banners/pwa-banners.component.spec.ts
  PASS: 33 tests, Chrome Headless 157. The ignored tsconfig extends
  tsconfig.login-check.json and includes these three specs plus src/**/*.d.ts.
- Production build evidence above belongs to the feature tree. The guarded
  deployment will build the complete integrated tree with build:dev (optimized
  production-mode/PWA build pointing only to DEV), before the Hosting write.
- git diff --cached --check: PASS. No executable changes after focused tests.
- Publish test then invoke scripts/deploy-test.ps1 Frontend with an isolated
  Node 20.20.2 PATH and ignored npm/firebase launchers selecting that runtime.
  No global Node/CLI installation changes. No backend or production deployment.
- Final release/artifact verification is recorded in ignored deployment-logs
  evidence and the final chat response after the deployment completes.
