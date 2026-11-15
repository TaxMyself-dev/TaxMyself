# Assistant business selection (S20 fix)

- Status: `COMPLETE` (local commit; no main integration, push or deployment)
- Worktree: `C:\Users\user\Keepintax\TaxMyself-new-ai-assistant`
- Branch: `new-ai-assistant`
- Base commit: `e27fd5ad`
- Evidence: `docs/research/assistant-qa-verification-2026-11-15.md` §8 (cause) and §9 (fix and verification); raw runs in the git-ignored `.local/assistant-qa/verification-2026-11-15/`.

## Business outcome

The chat answers about the business the user names, keeps the business established in the conversation, shows business buttons only when it is ambiguous, and never silently uses a business left over from another app screen. Non-chat use of the `businessnumber` header is unchanged.

## Acceptance criteria

- [x] A named business is read even when the page context holds another (live L1: 999100020, 1,500 / 318.60 / 1,181.40).
- [x] An unnamed question with several businesses and no conversation business shows buttons; the press completes it (live L2: 2,360, pending 118 excluded).
- [x] Follow-ups use the conversation's business; naming another business switches (live L3: 354/590/826/590, then 708).
- [x] The established business survives a reload (derived from stored messages; unit test).
- [x] Foreign/revoked businesses rejected; a legacy header-derived conversation value is not a confirmed choice (unit and Nest specs).
- [x] All-business expense totals unchanged; non-chat header behavior unchanged (existing specs; guard spec).

## Changes

- Nest `agent-harness`: `chooseBusiness` no longer falls back to the header; `listBusinesses` (access-checked directory); `listUpcomingReports.activeBusiness` is the only business or null. Specs restated for the new rule plus an S20 P&L case and directory/revocation tests.
- Agent: `agent-conversation-business.ts` (name matching, `data-businessContext` part, conversation business from stored messages, books wrapper filling the conversation's business, `<businesses>` context section); directory read per turn in `agent-chat-response.server.ts`; `agentAnswerBusinessViolations` in the answer check; instructions, `BUSINESS_REQUIRED`/`BUSINESS_NOT_FOUND` next steps and `businessNumber` schema text; eval fakes gain `listBusinesses`; prompt snapshots updated.
- Frontend dev chat: stops sending the page's `businessnumber` header and no longer shows "active business"; spec asserts no header.
- No schema change; `agent_chat_conversations.business_number` is left as the legacy record and not read.

## Verification

- Agent unit project (`npx vitest run --project unit`): 62 files passed, 3 skipped; 336 tests passed, 22 skipped (MySQL integration tests without a scratch DB). After the final instruction correction, the two affected files were rerun: 24/24.
- Nest `npx jest src/agent-harness src/guards --runInBand`: 9 suites, 156 tests passed.
- Frontend `ng test --ts-config=.test-tmp/dev-agent.spec.json` (ignored scratch config extending `tsconfig.admin-ai-chat.spec.json` with `skipLibCheck`) for admin-panel and dev-agent specs: 21/21.
- `tsc --noEmit` (agent), `ultracite check` on changed agent files, `npm run build` (agent), `npx nest build`, `npx ng build`: passed.
- Live, browser (Playwright/Chrome, ordinary UI), backend from this worktree on port 3012 with `DISABLE_SYNCHRONIZE=true`, `SKIP_BOOT_SEED=true`, `DB_DATABASE=keepintax-dev` (boot log `synchronize=false`), frontend on 4210: L1 pass; L2 first run failed (the model widened the ambiguous question to both businesses, 3,068), one focused instruction correction, rerun L2+L3 pass. 6 model answer turns. No memories, tasks or accounting changes (fixture recheck identical).

## Incident (history preserved)

During the first live attempt a plain restart booted this worktree's backend with `synchronize=true` against keepintax-dev (2026-11-15 ~15:00); it failed on the `subscription` pricing schema and was killed. The pricing schema was afterwards repaired by Codex from the original migration after a backup (4 columns and 3 CHECK constraints restored; 41 subscription rows unchanged). Every later backend start set and verified the three safety variables above. Details: investigation report §8–§9.

## Remaining

- Evals still model the old header default in their fakes (`active:`) and were not run; named-business and no-header eval cases are listed in the report §8.5.
- Live checks used the dev chat page only; the production app has no chat surface yet.
