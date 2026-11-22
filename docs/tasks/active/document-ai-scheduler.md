# Document AI Scheduler rounds

- Status: LOCAL_MAIN_INTEGRATION_APPROVED_VERIFIED
- Manager/implementation: Codex, no delegated agents
- Worktree: C:/Users/user/Keepintax/TaxMyself-scheduler-background-round
- Branch: codex/scheduler-background-round
- Base: 5d405a014aded6995c4c4bf987af894f275eada8 (Elazar explicitly selected local main after remote divergence was reported)
- Remote observed: 82446400227ee6e5ed8751eafc2eab1656c4161c

## Acceptance criteria and plan

1. Inspect existing queue, auth, cron/interval paths and constraints. Preserve existing changes and production schema.
2. Add a service-authenticated bounded round: no AI for empty/not-due work, maximum two global document tasks, existing quota/fairness/fencing/idempotency, saved-result reuse and UNKNOWN protection.
3. Await tasks and heartbeat settlement, propagate cancellation on deadline/disconnect/shutdown, and test overlap, failure and recovery with mock dependencies only.
4. Build Nest, review complete diff, document exact activation/auth/timeouts and uncovered background paths.
5. Commit locally and stop before main integration. No main changes, push, cloud mutations, live DB/app/providers/mail or deletion.

## Environment and scope

- Main's untracked backend/journey-timings.local was preserved; current chat's unrelated scratch files were preserved.
- Copied the only discovered ignored local env file, backend/.env, without overwriting an existing environment. git check-ignore confirms exclusion. Tracked environment files come from the selected base. No server started; no feature/main port configuration changed.
- Source build uses independent npm ci --ignore-scripts --no-audit --no-fund (1176 packages, exit 0, 47s). Node v24.13.0; npm 11.6.2. Dependency lifecycle scripts were deliberately not executed.
- No schema changes; no migrations or cutover SQL executed. Production schema completion and Composio version/host information are operator-reported and not rechecked via data access.
- Security change is limited to the requested OIDC service route. No user auth, ownership, accounting policy, deletion capability or retention expansion.
- The initial agent packaging blocker was observed on the original feature base; latest local main has since fixed it, as recorded in the integration section below.

## Verification evidence

- Initial diagnostic: npm test -- --runInBand document-ai-scheduler.spec.ts document-ai.worker.spec.ts document-ai.store.spec.ts document-ai.capacity.spec.ts: 4 suites / 53 tests passed, exit 0, 35.707s.
- npm run build: exit 0 after initial implementation, and again after global admission/shutdown refinements.
- Consolidated regression command: npm test -- --runInBand document-ai email-intake protected-pdf/protected-pdf.worker.spec.ts documents/documents-inbox-restore.spec.ts documents/email-ai-outcome.spec.ts documents/document-outcome.spec.ts documents/gmail-extraction-prompt.spec.ts google-drive.service.file-access.spec.ts google-drive.service.delete-file.spec.ts dev-completion-mode.spec.ts: 24 suites / 193 tests passed, exit 0, 64.969s. The protected-pdf.worker.spec.ts pattern matched no file; dedicated actual protected-PDF specs run separately below. Processor/Drive log lines in these tests come from synthetic mocks.
- Protected-PDF command: npm test -- --runInBand protected-recovery.spec.ts protected-intake.spec.ts protected-ai-boundary.spec.ts protected-pdf.service.spec.ts: 4 suites / 33 tests passed, exit 0, 26.16s.
- Final queue/SDK command after global count parameter and shutdown refinements: npm test -- --runInBand document-ai documents/email-ai-outcome.spec.ts: 10 suites / 101 tests passed, exit 0, 30.215s. npm run build passed, exit 0, on that code tree.
- Final review added an initial disconnect-state check (client may disconnect during authentication). Final command npm test -- --runInBand document-ai-scheduler.spec.ts: 1 suite / 26 tests passed, exit 0, 19.282s. Final npm run build: exit 0. Only this controller and its tests changed after the 101-test run; all other passing evidence was reused.
- git diff --check: passed. Complete executable diff and new auth/controller/context code reviewed, including a search confirming AnthropicDocumentProvider remains the only production caller of document extraction. No global route prefix/guard changes.
- Worktree attached to this chat using attach_worktree. Environment file hash equality was checked without displaying the hash/content; .env remains ignored. Main still resolves to the original base with the same untracked journey-timings.local file.
- No repository Markdown-link checker was found. A focused local Markdown-target check of the changed docs is run separately; external references were checked against official Google documentation. All build/test output is untracked/ignored. Local commit is the commit containing this completed task record; its exact hash is reported in the chat handoff.
- These are staged-revision results, not a claim that one complete repository-wide suite ran on the final revision. No known failure in the executed checks. No frontend files changed; Angular build and unrelated suites not run. No live contention/load test or Docker image build.

## Handoff / activation limits

See [operator runbook](../../features/document-ai-scheduler.md) for coverage audit, exact profile, identity/IAM setup and commands (prepared only, not executed).
The current round refills up to two concurrent slots for a 60-second admission window and drains afterwards. A second authenticated maintenance endpoint covers shared upload recovery/temporary cleanup. It does not make all background work production-ready: full Gmail and protected-PDF lifecycles, auto-classification, inbox discovery and other cron work still require reliable separate execution. Cancellation is cooperative; non-abortable DB operations are awaited and forced termination relies on lease recovery/fencing.

Main integration requires Elazar's separate explicit approval. Push additionally requires his personal test of the current local main revision and explicit push approval. Nothing in repository automatic-delivery instructions overrides these gates.


## Requested follow-up: rolling minute and maintenance closure

- Base implementation: 2f1bd4f5fd6f8c0816c26284da1845e9d7fcb20f.
- Elazar requested immediate slot refill for as much eligible work as fits in one minute, while retaining the global two-task ceiling, and closure of the upload-recovery/temporary-cleanup trigger gap.
- Plan/acceptance: a 60-second rolling admission window with full drain; a separate OIDC-protected, bounded maintenance request; unchanged expiry/tag/folder/hash/reference/deletion retry guards; offline tests for slot refill, cutoff, maintenance overlap/shutdown, partial upload scans and deletion refusals; final Nest build, documentation and local commit only.
- The maintenance endpoint needs a second once-per-minute Scheduler job. Both exact create/describe/pause commands are in the operator runbook and were not executed. Other Gmail/protected-PDF/classification background coverage remains unchanged.
- Diagnostic run: npm test -- --runInBand document-ai-scheduler.spec.ts document-ai.sources.spec.ts document-ai.execution.spec.ts was interrupted under severe host memory pressure (about 300MB free; Jest about 2.3GB). Exit 1 from the intentional process stop; two suites had printed PASS, but this was not a completed passing run.
- Memory-bounded diagnostic: node --max-old-space-size=768 node_modules/jest/bin/jest.js --config 'C:/Users/user/Documents/ChatGPT/Keepintax - GMAIL/scheduler-offline-jest.json' --runInBand document-ai-scheduler.spec.ts document-ai.sources.spec.ts document-ai.execution.spec.ts: 3 suites / 65 tests passed, exit 0, 70.673s. This temporary external configuration keeps the repository's Jest discovery/aliases but uses ts-jest isolatedModules=true to reduce memory; it does not disable assertions. A separate final Nest build checks types. The test configuration is not committed or made a project default.
- Added a due-time predicate at cleanup claim, preventing an overlapping stale discovery from bypassing next_at after RETRY; owner/business, expiry, purpose, terminal state and lease guards remain intact. Dedicated mock DB boundary coverage added.
- Final consolidated offline regression command: node --max-old-space-size=768 node_modules/jest/bin/jest.js --config 'C:/Users/user/Documents/ChatGPT/Keepintax - GMAIL/scheduler-offline-jest.json' --runInBand document-ai email-intake google-drive.service.file-access.spec.ts google-drive.service.delete-file.spec.ts protected-recovery.spec.ts protected-intake.spec.ts protected-ai-boundary.spec.ts protected-pdf.service.spec.ts. Result: 23 suites / 207 tests passed, exit 0, 81.802s, on the final executable tree. Sequential build command: $env:NODE_OPTIONS='--max-old-space-size=2048'; npm run build: exit 0, including full TypeScript checking. Host memory pressure made the build slower; it was allowed to finish and was not restarted. No live providers, DB connections, user data or actual file deletion. Both invocations have 60-second start windows and a 120-second cooperative abort budget; non-abortable DB work is still awaited. No schema or production change, main integration or push.

- Final review: git diff --check and local Markdown-target checks passed. Reviewed the full follow-up diff: only the worker/controller/executor, existing maintenance implementation/transport cancellation, due-time claim fence, tests and scoped documentation changed. No change to the cleanup method's ownership/tag/hash/reference policy, no new schema or deletion scope. No frontend changes, so no Angular build. Live multi-instance MySQL contention, representative production load/latency, and forced container termination still require separately authorized acceptance; offline mocks are not claimed as production proof.


## Approved local main integration — 2026-11-22

- Explicit user authorization: integrate codex/scheduler-background-round into current local main after current-main, port and required-check verification; no push or deployment.
- Main before integration: 17961d37057db9dc5bafe0c63284f36953489c1b, clean. Remote read-only check (git ls-remote origin refs/heads/main): 82446400227ee6e5ed8751eafc2eab1656c4161c. Current local main already includes that remote reconciliation; no remote feature integration was inferred.
- Feature source commits: 2f1bd4f5fd6f8c0816c26284da1845e9d7fcb20f and 1db6ad4f7f1ebe3b47ed2aed52e53b3ef3868af1.
- git merge --no-ff main -m "Merge current local main for Scheduler integration verification" ran only in the feature worktree, without conflicts. Combined executable candidate: 9ee58c5fd4d3def899623e3a745a750550ff3419. Main remains its ancestor. Backend package.json/package-lock.json are unchanged from the independently installed feature dependencies; no reinstall or shared node_modules was needed.
- Selected tier: backend service/controller/domain plus direct shared Drive callers. No executable frontend difference versus current main, so Angular build/tests were not applicable. The newer main agent loader receives seven narrow offline checks; no Docker rebuild, full agent evals, app bootstrap, providers, live DB or user data access.
- Combined regression command: node --max-old-space-size=768 node_modules/jest/bin/jest.js --config 'C:/Users/user/Documents/ChatGPT/Keepintax - GMAIL/scheduler-offline-jest.json' --runInBand document-ai email-intake google-drive.service.file-access.spec.ts google-drive.service.delete-file.spec.ts protected-recovery.spec.ts protected-intake.spec.ts protected-ai-boundary.spec.ts protected-pdf.service.spec.ts documents/documents-inbox-restore.spec.ts. Result: 24 suites / 215 tests passed, exit 0, 26.205s on 9ee58c5f. Same temporary isolated transpilation config as prior verification; final Nest build checks types separately.
- node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs: 7 passed, exit 0, 377.5321ms. The source-only Node diagnostic emits the previously documented MODULE_TYPELESS_PACKAGE_JSON warning; production uses compiled CommonJS. Test-owned temporary fixtures only, no application request or provider call.
- Final build result: passed, exit 0 (full TypeScript checking; command: $env:NODE_OPTIONS='--max-old-space-size=2048'; npm run build).
- Main port gate: node frontend/scripts/start-local.js --print-config reports frontendPort=4200, backendPort=3000, apiUrl=http://localhost:3000/, source=main defaults. node backend/scripts/start-watch.js --print-config reports backendPort=3000, synchronize=false. angular.json serve defaults to development, no explicit port or file replacement override for that serve path. Backend .env PORT=3000; inherited process PORT and NODE_OPTIONS are unset. No .local-ai-dev port override is active in main. Existing main listeners were also observed at 4200 and 3000; the matching Node command lines contained no explicit --port override. No server was started/restarted for these checks.
- Existing ignored main environment is preserved: DISABLE_SYNCHRONIZE=true and SKIP_BOOT_SEED=true; no Scheduler mode/capacity settings were added. Neither saving code nor local integration creates Cloud Scheduler jobs or changes Cloud Run/DB configuration.
- Final diff/Markdown checks and metadata commit record this verified candidate without further executable changes. Delivery is a fast-forward of clean main to this reviewed feature, conditional on main still matching the checked starting revision. The resulting exact main hash is reported in the chat handoff. Keep the feature worktree; no archive, remote push or deployment is authorized.
