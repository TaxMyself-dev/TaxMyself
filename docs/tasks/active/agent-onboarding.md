# Agent onboarding and persistent profile

- Status: IMPLEMENTED_AWAITING_DATABASE_VERIFICATION
- Task manager: Codex
- Worktree: TaxMyself-agent-onboarding
- Branch: codex/agent-onboarding
- Base commit: c0a37b21 (new-ai-assistant, includes current main ea5ba2b3)

## Business outcome

Build the first onboarding conversation and interface from the agreed profile,
narrative, MySQL memory and history specification. Continue the existing AI
feature in isolation; preserve its untracked planning documents.

## Acceptance criteria

- Free narrative and guided questions fill basic fields without repeating known data.
- Personal and business facts, stories and dated history are kept separately.
- Server-side preview, version checks, transactions and idempotent confirmation.
- Corrections differ from transitions; partial dates stay partial.
- UI shows current knowledge and history and supports updates and forgetting.
- Ordinary agent chat receives owner-scoped profile context without starting onboarding.
- Owner/delegation boundaries and disabled-feature behavior are tested.

## Boundaries

No accounting changes, background reviews, production access, deployment, main
integration or push. New SQL is authored for review but not applied to a live
database. The user requested backend and UI implementation of the agreed schema.
Personal main-integration and push gates override repository automatic delivery.

## Verification and handoff

Code implementation and available automated checks complete. Database execution and main integration remain unapproved. An isolated npm install was required per package.
Frontend npm ci initially failed on three missing optional undici-types 8.9.0
lock entries. npm install --package-lock-only fixed those entries without
changing package.json. Existing frontend Node engine declaration prefers Node
20 while the host uses Node 24; successful build/test results must be recorded
rather than claiming that warning was resolved.

Local Docker's Linux engine was unavailable. No shared development or production
database was used as a substitute. SQL integration activation remains explicit.

## Final evidence on the feature checkout

- backend: npm run build — exit 0 on final executable changes.
- backend: npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.mysql.spec.ts — exit 0, 22 passed, 6 explicitly skipped (local MySQL URL absent).
- Existing agent-harness controller/access tests — 18 passed earlier in the same feature; their inputs remain unchanged. This is reused focused evidence, not a single combined final-revision run.
- frontend: npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json — exit 0, 8 passed in ChromeHeadless 157, including actual template rendering and native dialog behavior. Chrome needed forced termination after successful completion; no test failed.
- frontend: npm run build -- --configuration production — exit 0 on final executable frontend changes. Existing-file style budgets, CommonJS optimization and the 3.20 MB initial bundle warnings remain; no broad baseline suite was run or claimed green.
- backend/agent: npm run typecheck — exit 0, existing Effect suggestions only.
- backend/agent: npm run check — exit 0 after fixing authored formatting and formatting the touched GUIDE.
- backend/agent: npm test -- --maxWorkers=2 --reporter=dot — exit 0, 365 passed, 22 skipped, 67 files passed and 3 skipped. The first broader parallel run had one 5-second Git-state timeout; its isolated rerun and this full bounded run passed without changing its threshold.
- backend/agent: npm run build — exit 0.
- The prompt snapshot mismatch was reviewed: only the new onboarding context source and dedicated onboarding instructions changed. Updated that snapshot, then the complete agent unit suite passed.
- Bounded real-model diagnostics used synthetic text. They exposed joined/ellipsized source evidence and loss of simultaneous home/office context. Changed the schema to exact quote arrays and structured workplace modes, preserved month precision and added deterministic server-side date clarification. Rechecked only affected cases. The model itself did not reliably ask for a date; the backend now enforces that boundary and its unit test passes. These are diagnostics, not a statistically validated model-quality evaluation.
- No MySQL server was contacted, no SQL applied and no full authenticated onboarding-to-database journey executed. Docker's Linux engine was unavailable. Six disposable-local-MySQL tests remain skipped; no claim of persistence integration verification is made.
- New schema affects only five agent_onboarding tables. No accounting entity/report behavior, production service, main checkout or remote ref was changed. Frontend onboarding is behind the existing agent development-route flag; backend activation is opt-in through AGENT_ONBOARDING_ENABLED.
- Profile updates use the dedicated onboarding conversation. Ordinary chat consumes context but does not write these profiles via legacy memory tools. Forgetting covers onboarding memory and its stored sources/versions, not ordinary chat transcripts or backups.

## Next gated step

Review the new SQL and obtain explicit authorization for an identified development database before applying it and completing persistence and authenticated-flow verification. Local main integration and remote push remain separate approval gates. Do not treat automated checks as Elazar's manual main verification.
