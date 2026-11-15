# Page-wide guarded Enter login

- Status: `WORKER_COMPLETE`
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

Frontend login only. No backend/schema/accounting changes. No authorization to
integrate main/test, push or deploy this new feature. Preserve existing changes.

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

## Follow-up: closed PrimeNG host blocked background Enter

- Reproduced by read-only DOM inspection of the user's actual DEV browser tab:
  focus was BODY, native submit was enabled, and the sole dialog selector match
  was an empty p-dialog[role=alertdialog], display:block, width 1920 / height 0.
  No credential values were read and no authentication action was triggered.
- The old getClientRects().length guard treated that zero-area host as an open
  dialog. PrimeNG keeps its host mounted after the real panel is closed.
- Fix: a blocking dialog must have CSS visibility:visible and a rectangle with
  both width and height greater than zero. Real nested dialog panels still block.
- Same focused test command above, now on direct Node 20.20.2: PASS, 32 tests,
  exit 0 (29 existing plus three regressions for zero-height host, real panel in
  a zero-height host, and CSS-hidden positive-size panel).
- Production build: direct Node 20.20.2, NG_BUILD_MAX_WORKERS=1, ng build
  --configuration production --progress=false: PASS, exit 0, hash
  212e1b12afc969e0, reported build time 154610 ms. Same nonfatal stylesheet/
  initial bundle budget and CommonJS warning categories as the previous build.
- git diff --check: PASS. No executable changes after passing tests/build.
- No executable edits after passing tests except an explanatory source comment.
- Existing test/main integration and push/deployment approvals do not authorize
  this new executable fix; completed local commit will be offered for approval.
