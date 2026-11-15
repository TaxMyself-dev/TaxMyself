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

## Follow-up: evals aligned with the fix (2026-11-15, bounded diagnostic run)

- Base revision `b2c7c0c8`. Changes are limited to the eval harness and fakes, the eval cases and the unit tests that use the fakes. No product code was changed.
- Fakes (`agent-eval-books.ts`, `agent-eval-reports.ts`):
  - The `active` option and its fallback are removed. A single-business read is the business asked for, else the only one, else `BUSINESS_REQUIRED`.
  - `listUpcomingReports.activeBusiness` is the only business, else null.
- Harness (`agent-eval-harness.ts`, `agent-eval-step-messages.ts`, `agent-eval-answer.ts`, `agent-eval-scenario.ts`) prepares each step with the production helpers:
  - directory from `books.listBusinesses`;
  - `withAgentBusinessContext`, `agentConversationBusiness` and `agentBusinessesSection` in the user context;
  - books wrapped with `withConversationBusiness`;
  - the answer check gets `businesses`.
- Harness approximation: the eval's stored conversation keeps only user messages. The conversation's business is therefore the one the new message names, else the one carried from the previous answer's wrapper state. A button press is not itself an event in the eval: the model's read with that business number establishes it.
- `AgentEvalScenario.conversationBusiness` replaces `active` for a business established before the first message. Phase 3 cases default it to the studio; the reports exempt case uses the workshop.
- Cases:
  - `query-expenses-businesses`: the "active" case becomes "fresh chat names the second business". The tool must receive 039876541, never the studio.
  - `chat-interaction` S2 adds: no silent or all-business read before the buttons.
  - New `chat-interaction` S2 retain/switch case: press the studio, then a phone follow-up reads the studio, then naming נועה קרמיקה reads it, with the fixture's 431.15.
  - The all-business cases are kept, with `active` removed.
- Deterministic results:
  - `npx vitest run --project unit tests/src/agent/tools/books`: 37/37 passed.
  - `npx tsc --noEmit -p .`: 0 errors.
  - `npx ultracite check` on the 14 changed files: clean.
- Live-model eval executions: **0 of the 5 allowed**. The 10-minute timebox was spent by 20:00. Started 19:51:23; deterministic checks finished 20:03 (about 12 minutes).
- This was a bounded diagnostic run, not full regression verification. None of the updated or new eval cases has been run against the model; that is the remaining gap. The cases to run are the four named above, starting with `query-expenses-businesses` "reads the business a fresh chat names" and `chat-interaction` "a chosen business is kept…".
- `runAgentHistory` (stored-history cases) is not wired to the business helpers.

## Follow-up 2: button press and stored history (2026-11-15, 20:19:56–about 20:29, bounded)

- Files changed:
  - `backend/agent/tests/evals/agent/harness/agent-eval-step-messages.ts`
  - `backend/agent/tests/evals/agent/harness/agent-eval-harness.ts`
  - new `backend/agent/tests/src/agent/tools/books/agent-eval-business-harness.test.ts`
  - No product code was changed.
- Gap 1 (button press):
  - `agentEvalBusinessAfterChoice` gives the answered question to the production reader `agentConversationBusiness`, in the shape the chat stores it (a returned `tool-askUserQuestion` part whose output is the pressed `{value,label}`).
  - The carried business is placed before it as a `data-businessContext` part, so the reader's own rules apply: a business establishes itself, "all" clears it, any other value leaves the carried one.
  - The answer step's `current` is that business, and the harness's `withConversationBusiness` state starts from it. The press therefore takes effect before the answer's first read.
- Gap 2 (stored history):
  - `runAgentHistory` reads the directory and prepares the history with `agentEvalHistoryBusiness`, which applies `withAgentBusinessContext` to each user message as the endpoint did when it was sent, then calls `agentConversationBusinessState`.
  - It adds `agentBusinessesSection` to the user context, wraps the books with `withConversationBusiness` and passes `businesses` to the answer check.
- Deterministic tests (new file, 5 tests):
  - A press establishes the business before the first read (an unnamed read returns the pressed business).
  - "all" clears it, and another value keeps the carried business.
  - A history restores the business from a named message or from an earlier read by number.
  - A new message naming the other business overrides the press.
  - A history with no named, pressed or read event has no business, and an unnamed read gives `BUSINESS_REQUIRED`. The legacy `agent_chat_conversations.business_number` is not part of stored messages, so the reader cannot see it.
- Commands and results:
  - `npx vitest run --project unit tests/src/agent/tools/books`: 42/42 passed.
  - `npx tsc --noEmit -p .`: 0 errors.
  - `npx ultracite check` on the 3 changed files: clean.
- Model evals: **0 of the 2 executed, 0 model answer turns.**
  - Eval A (`chat-interaction` "a chosen business is kept…"): `npx vitest run --project evals … -t` did not load. It failed with `DeepEvalError: … TYPESAFE_API_KEY not configured` because plain vitest does not load the env files that `npm run eval` loads. No model turn ran.
  - Eval B (stored history, then an unnamed follow-up, then a named override): not written. The timebox ran out.
- The task stays open: both gaps are addressed deterministically, but neither model eval is verified.
- Remaining approximation: a typed message's business is still computed from that message alone plus the carried state, not from the whole stored conversation, because the eval stores no assistant UI parts. `runAgentHistory` is single-turn, so eval B's override step needs a second history run.

## Follow-up 3: model evals A and B (2026-11-15, 20:55:55–about 21:01)

- Tested revision: `e73eed79` plus eval B, committed with this note. Eval B is the new `chat-interaction.eval.ts` case "S2: a business chosen in a stored conversation is kept, and naming the other switches".
  - It makes two linked `runAgentHistory` calls.
  - The history holds a stored `tool-askUserQuestion` press of the studio (514789632), then the unnamed "וכמה הוצאתי על דלק השנה?".
  - The second call carries the first answer forward: its actual `queryExpenses` inputs, with outputs from the same deterministic books, and its text. It then adds "ובעסק נועה קרמיקה?".
- Command (from `backend/agent`; loads `../.env`, no secrets printed):

  ```
  npm run eval -- --variant business-selection --reps 1 tests/evals/agent/interaction/chat-interaction.eval.ts -t "S2: a (chosen business is kept|business chosen in a stored)"
  ```

  The first launch stopped before any model call with `AGENT_EVAL_RUN_VARIANT: pass --variant <name>`; it was relaunched with `--variant`.
- Results (`.eval/agent/runs/business-selection/results.jsonl`, model gpt-6-luna): **2 passed, 10 skipped.**

  | Eval | `passed_all` | Tool reads (input business → returned business) |
  |---|---|---|
  | A | true | unnamed `queryExpenses` (no business read) → `askUserQuestion` → `"514789632"`→514789632 → unnamed follow-up →514789632 (filled in from the press) → `"039876541"`→039876541 |
  | B | true | unnamed →514789632 (restored from the stored press, no question asked, 1,662) → `"039876541"`→039876541 (431.15) |

- Counts: 2 evaluated cases, 1 repetition each; 6 model answer turns (A 4, B 2; `attempts.jsonl` has 6 lines). No retries.
- Checks: `npx tsc --noEmit -p .` 0 errors; `npx ultracite check` on `chat-interaction.eval.ts` clean.
- Elapsed: about 5 minutes. All checks requested in this follow-up were run.
- Business-selection evals A and B are verified. The approximations recorded in Follow-up 2 still apply to the harness. The other eval cases changed in `234cc7b4` have still not been run against the model.
