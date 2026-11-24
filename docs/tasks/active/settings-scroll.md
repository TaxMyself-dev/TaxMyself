# Settings section scroll coordination

- Status: WORKER_COMPLETE
- Branch: codex/settings-scroll
- Base: 91a25287 (verified local main)

## Acceptance

- A clicked section remains selected through smooth scrolling and subsequent layout changes.
- Intermediate sections do not activate lazy content or overwrite section memory during programmatic scrolling.
- Recompute the anchor on async content or viewport resizes, without restarting unchanged destinations.
- Clamp bottom targets to the available scroll range without repeated correction loops.
- New clicks replace the previous destination. Wheel/touch/pointer/navigation keys cancel anchoring and pending animation.
- Restored sections and reduced-motion navigation remain instant. Component teardown disconnects observers and cancels animation.
- Preserve existing admin gating, lazy activation, forms, authorization and session-only navigation memory.

## Diagnostic and verification plan

On the base, a headless-Chrome diagnostic using actual page methods reproduced a
short history section being relabeled as categories, and async content growth
leaving permissions 650px before its expected position. Fix anchor coordination,
then verify with browser layout/animation regressions, the existing navigation
and page tests, and the production frontend build. No backend/provider/database
calls or schema changes. No main integration or push is authorized for this task.

## Exact verification commands

From frontend, select only the three affected spec files for both TypeScript and Karma:

```powershell
$specs = (Get-Content tsconfig.settings-scroll.spec.json -Raw | ConvertFrom-Json).include | Where-Object { $_ -like '*.spec.ts' }
$ngArgs = @('node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--browsers=ChromeHeadless', '--ts-config=tsconfig.settings-scroll.spec.json')
foreach ($spec in $specs) { $ngArgs += "--include=$spec" }
node @ngArgs
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

## Evidence

- Browser regressions use actual native scrolling, real DOM geometry and ResizeObserver with the page methods on a synthetic layout. They do not mock scrollTo or contact user services.
- Existing navigation and page tests cover lazy activation, section memory, admin restrictions and unchanged form behavior.
- Initial diagnostic test compilation failed on an overloaded scrollTo spy type. Corrected the test typing; no application test failures were evaluated in that compilation-blocked invocation.
- Final native-scroll rerun: 12/12 passed, exit 0, Chrome Headless 157. Exact affected rerun: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.settings-scroll.spec.json --include=src/app/pages/settings-new/settings-scroll.spec.ts`.
- Existing navigation/page tests: all 26 passed in the preceding selected 38-test run. Only browser-fixture spy initialization changed afterward, so their evidence is reused. This is 26 unchanged passes plus a final 12-test rerun, not a full 38-test pass on the final test-file revision.
- Reviewed diagnostic runs: the first runnable selected batch had 10 failed / 28 passed; a browser-only geometry sample had 9 failed / 3 passed. The fixture measured scrollHeight/clientHeight as zero because Ionic hides body before hydration; enabled production-equivalent hydration and added explicit nonzero-dimension assertions. The old page mock also lacked the newly used scroll-range fields. The next selected batch had 2 failed / 36 passed: both failures included initial observer memory writes before the click. Reset the setup spy history, preserving strict single-click assertions; the final affected 12-test rerun passed. No timing limits or success thresholds were relaxed.
- An attempted `--filter` CLI diagnostic was rejected as unsupported and executed no tests; bounded `--include` selection was used instead.
- Standalone headless diagnostic using the final application methods: requested short history remained history at offset 32px; requested permissions remained permissions at offset 32px and intermediate sections were not activated.
- Production build: passed on final executable source, exit 0, hash 31b7016d8f3f281a, 250076ms. Existing initial bundle/style-budget/CommonJS and intentionally retained inbound-email import warnings remain. The process was observed near Node's default heap limit, but finished normally before any memory change or restart; no runtime configuration was changed.
- Complete implementation/test diff reviewed. git diff --check and cached diff check passed; 93 local Markdown links validated. Structural checks confirmed the legacy settings view remains removed and dedicated forwarding-email selection remains hidden.
- No unrelated suites, backend tests or live OAuth/AI/database runs are required for this frontend-only behavior change.
- Main/push/deployment remain untouched. Worktree cleanup is due only after a later authorized main integration, after preserving unique local files and verifying no active consumers.
