# Gmail manual import date range

- Status: LOCAL_MAIN_INTEGRATION_AUTHORIZED
- Branch: codex/gmail-manual-date-range
- Base: c94b2c578cfd27f763bca1a68fb2c506b6a22078 (verified local main; origin/main differs)
- Worktree: C:/Users/user/Keepintax/TaxMyself-gmail-manual-date-range

## Acceptance criteria
- Manual pull dialog requires a date range for all selected eligible accounts.
- Reuse initial-import server bounds and inclusive end date; reject invalid dates before scheduling any run.
- Preserve owner/account eligibility, deduplication, initial and nightly behavior.
- Preserve legacy API no-date default; reject partial ranges and query overrides combined with dates.
- Focused backend/frontend checks and builds; local feature commit only.

## Boundaries
No schema, production, credentials, provider-contract, or accounting changes. Main integration and GitHub push require Elazar's separate approvals.


## Verification (2026-11-21)

Environment: Windows, Node v24.13.0, npm 11.6.2. Dependencies installed separately with npm ci --no-audit --no-fund in backend and frontend. Frontend emitted its existing Node ^20 engine warning. The primary checkout was clean; origin was refreshed and differs from local main. No main update was authorized or performed. Copied backend/.env from primary and verified git check-ignore backend/.env; no secrets printed/staged.

- Backend: npm test -- --runInBand --silent --runTestsByPath src/integrations/integrations.controller.spec.ts src/integrations/services/gmail-sync.service.spec.ts src/email-intake/email-intake-runs.spec.ts src/email-intake/email-intake.store.spec.ts — exit 0, 4 suites / 39 tests passed (164.184s). Expected failure-path Nest logs appeared in passing sync tests.
- Backend: npm run build — exit 0.
- Frontend default focused command: npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/services/integrations.service.spec.ts — exit 1 before executing tests. The repository's broad tsconfig.spec.json still compiles unrelated legacy specs and incompatible library declarations despite --include.
- Baseline reproduction: git archive c94b2c578cfd27f763bca1a68fb2c506b6a22078 frontend into temporary frontend/.tmp-baseline-gmail, then node node_modules/typescript/bin/tsc --noEmit --pretty false -p .tmp-baseline-gmail/tsconfig.spec.json — exit 1, reproduces stale component-export tests, removed Angular async helper, missing Node types, and AI SDK generic Uint8Array declaration errors on exact unchanged baseline source. Temporary source snapshot uses normal ancestor module resolution inside this worktree; no symlinks/shared node_modules.
- Frontend isolated run: npm test -- --watch=false --browsers=ChromeHeadless --ts-config=.tmp-gmail-spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/services/integrations.service.spec.ts — exit 0, 12/12 tests passed in Chrome Headless 157. Temporary config extends tsconfig.spec.json, sets types to [jasmine,node] and skipLibCheck:true (same declaration policy as tsconfig.app.json); files are src/test.ts, src/polyfills.ts and the two specs above; include is src/**/*.d.ts. No assertions changed or disabled.
- One attempted test command included --port=9878; Angular rejected this unsupported argument before execution. Retried with supported arguments above.
- Frontend production build: first npm run build completed compilation, then failed with ENOSPC during asset copy. Removed only this worktree's generated .angular cache (1124 MB) and baseline snapshot/archive (124 MB), recovering about 1.2 GB. Retrying with process-local CI=true to disable the default local disk cache; no tracked build configuration changed.
- Initial Python edit invocation could not execute because Python was unavailable; edits were applied using Node instead.

No live Gmail pull, production access, schema update, deployment, manual browser acceptance, main integration or GitHub push performed. Manual acceptance remains: open permissions, click pull now, select valid dates and accounts, check disabled invalid ranges, confirm one-day/end-day behavior with desired mailbox data. Existing content/message deduplication and nightly cursor are unchanged.

- Final frontend build: process-local CI=true; npm run build — exit 0, production build hash 639b3c75806e8e8d, 95438ms. Includes assets, index and service worker. Warnings: initial bundle 3.20 MB vs 2 MB warning budget (below 5 MB error budget), unrelated stylesheet budgets and CommonJS dependencies. No changed Gmail stylesheet warning. No code changed between passing checks and final commit.
- Final diff reviewed; git diff --check passed. Temporary baseline archive/source/config removed. Generated output/dependencies and ignored environment remain untracked/ignored as appropriate. Main integration and push remain pending explicit approval per personal instructions.
## Authorized local main integration (2026-11-21)

Elazar explicitly authorized local main integration for manual testing and explicitly prohibited GitHub push. Primary main was clean at c21a5eac92597beb95acf42501c2fb3c8a83d726. Merged it into the feature without conflicts; verified executable candidate 953ee9b30b2f3a3732c3065f3ef269c0a95fca7f. Main then advanced only by documentation commit 3f835ad0; preserved that via merge db3845bf. No executable changes followed verification, so passing evidence is reused for the final documentation-only revision.

Pre-integration effective local configuration verified in primary checkout: node frontend/scripts/start-local.js --print-config reports frontendPort 4200, backendPort 3000, apiUrl http://localhost:3000/, main defaults. node backend/scripts/start-watch.js --print-config reports backendPort 3000 and synchronize false. backend/.env PORT=3000; no ambient PORT/API_URL overrides; frontend npm start uses start-local.js, Angular serve development has no port override, environment.ts uses http://localhost:3000/. No local worktree port configuration was copied into main.

Checks on 953ee9b3 (exact commands as above):
- Backend focused Jest command: exit 0, 4 suites, 39/39 tests, 80.435 seconds.
- Backend npm run build: exit 0.
- Frontend isolated Gmail command with temporary .tmp-gmail-spec.json and process-local CI=true: exit 0, 12/12 Chrome Headless tests.
- Frontend process-local CI=true; npm run build: exit 0, build hash 20f5606ef0eada5b, 184317ms. Same nonblocking style/bundle/CommonJS warnings; no limits changed.
- Previously reproduced baseline broad-test compilation failures unchanged; no full-suite pass claimed. Temporary test config removed; complete main-to-candidate diff reviewed and whitespace check performed.

Delivery uses fast-forward only after a final clean-state and ancestry check. Manual acceptance and push approval remain pending; no remote push or production change is authorized.
