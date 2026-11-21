# Agent voice messages

- Status: IMPLEMENTED_AUTOMATED_VERIFIED
- Worktree: C:/Users/user/Keepintax/TaxMyself-agent-voice-messages
- Branch: codex/agent-voice-messages
- Base: c94b2c578cfd27f763bca1a68fb2c506b6a22078 (verified local main, clean).
- Remote refreshed. Local main and origin/main diverge; preserve both, no integration authorized.

## Acceptance criteria

- Browser-managed microphone permission, reused when the browser retains it.
- Microphone starts recording; arrow finalizes and sends once, trash cancels.
- Final transcription appears and persists as an ordinary chat text message without editing.
- No audio file persisted by Keepintax; no playback.
- Cancellation on conversation/client/auth changes and page destruction, including late results.
- Empty/failed/timed-out recording sends nothing. Two-minute capture limit.
- Preserve unrelated typed drafts and existing agent approval/authorization behavior.

## Scope

Reusable Angular voice controller and existing /dev/agent composer; existing authenticated Soniox key function.
No schema, accounting, deployment, main integration or push. Product chat UI remains separately scoped.
Focused chat tests, frontend production build, applicable backend checks, diff review and local commit.
SONIOX_API_KEY absent from copied backend/.env: live transcription requires user configuration.
Environment: ignored backend/.env copied; tracked landing/.env.development preserved from Git.

## Verification on final executable changes (2026-11-21)

- frontend: npx tsc --noEmit -p tsconfig.app.json — exit 0.
- frontend: npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.agent-chat.spec.json --include='src/app/pages/dev-agent/*.spec.ts' --karma-config=karma.voice.local.cjs — exit 0, 36/36 passed.
  Local Karma wrapper calls karma.conf.js and sets port 9897; archived outside Git with logs.
- frontend: npx ng build --configuration production — passed, hash 7d2cd68e9122d06a, 226056 ms; initial bundle 3.20 MB. Existing style/bundle budget and CommonJS warnings remain; no build errors.
- backend/agent: npm test -- --maxWorkers=2 — exit 0, 379 passed, 22 skipped (69 passed files, 3 skipped files), 223.12 seconds. Database integration tests skipped without AGENT_TEST_DATABASE_URL. No paid evals or live transcription executed.
- backend/agent: npm run typecheck — exit 0. Effect suggestions include existing sources and the new rate-limit error's optional nominal brand; no type errors.
- backend/agent: npm run build — exit 0.
- backend/agent: npm run check — exit 0, full format/lint check passed.
- git diff --check — exit 0.

Earlier diagnostic runs: default Angular discovery tried unrelated files outside the focused tsconfig; corrected with --include. A new UI test initially read ngModel before its async update; fixed its timing and observable stubs, then all 36 passed. The first broad agent run had 378 passed, 22 skipped and one 5-second Git-fingerprint timeout under concurrent machine load; the final bounded-concurrency run passed all 379 without changing timeouts or test criteria. No snapshots or thresholds were weakened.

## Review / handoff

- Final diff reviewed: existing chat transport, ordinary text persistence, actor/owner verification and domain approval rules retained. No schema/Nest/domain changes; agent package was rebuilt.
- Soniox browser SDK pinned to 2.5.0 and lazy-loaded; no unrelated dependency upgrades.
- Key issuance is bounded to 10/minute per verified agent user per server process; this is not a global multi-replica spending cap.
- Browser permission persistence follows browser/site settings. No permission flag or audio file is stored in Keepintax.
- Pending manual checks: configure SONIOX_API_KEY outside Git, test Hebrew amounts/dates/business names, real microphone permission reuse and Safari/iOS/Android. These checks were not performed.
- Product scope: connected to existing /dev/agent; controller is reusable by the future product chat.
- Feature worktree attached to this chat. Ignored backend/.env copied from primary checkout without exposing values. Source primary config lacks SONIOX_API_KEY. Tracked landing environment preserved.
- No application servers started; Karma used isolated port 9897. Suggested later local app ports: frontend 4207 and backend 3017 with /dev/agent?api=http://localhost:3017/; keep overrides local/ignored.
- Documentation: backend/agent/GUIDE.md, backend/agent/AGENTS.md, this task.
- Local main integration and GitHub push require Elazar's separate approvals. Neither performed.

- Delivery: local feature commit only; worktree retained for manual voice checks. All automated acceptance checks above passed on the final executable sources.

## Live setup and balance diagnostic (2026-11-22)

- Development key configured in ignored backend/.env; credentials never printed or committed.
- Temporary-key API returned 201; this verifies key issuance, not available transcription credit.
- A bounded WebSocket probe using 0.1 seconds of synthetic silence returned 402 / organization_balance_exhausted. No microphone audio was captured. Actual Hebrew transcription remains blocked on Soniox organization funds.
- SDK 2.5.0 maps 402 and 429 to QuotaError with statusCode; the UI now distinguishes exhausted credit from a request limit, and discards partial text in either case.
- Frontend running on 4207. Backend running on 3017 from the existing compiled build, with development DB validated, synchronize disabled and boot seeding skipped. Watch mode was stopped after repeated restarts; only this feature's verified process tree was stopped.
- No main integration or push.

### Balance-message fix verification

- frontend: npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.agent-chat.spec.json --include='src/app/pages/dev-agent/*.spec.ts' --karma-config=../.local-ai-dev/karma.voice.cjs — exit 0, 38/38 passed. Added provider 402/429 regression coverage and partial-transcript discard assertions.
- frontend: npx ng build --configuration production — exit 0; existing size/CommonJS warnings, no errors. Dev server recompiled successfully on 4207.
- git diff --check — exit 0. No backend executable changes for this correction; previous backend verification reused.
- External blocker: user must add Soniox organization funds under Organization > Billing; no payment or autopay change performed. Successful temporary-key creation alone does not verify streaming entitlement.
