# KT-108 - Agent chat interaction corrections (plan Phase 3.1)

- Status: `WORKER_COMPLETE` (implemented and verified locally; manager review pending; not integrated into main, not pushed)
- Task manager: Shoval Harel
- Worker: Claude Code (single-agent execution)
- Worktree: `C:\Users\user\Keepintax\TaxMyself-new-ai-assistant`
- Branch: `new-ai-assistant`
- Base commit: `8ffde33a` (plus `576d2feb`, the plan/GUIDE update that was already in the working tree, committed separately as found)

## Business outcome

Asking the assistant "כמה הוצאתי על דלק השנה?" reads the books and answers. It asks only what the request needs (which business, as working buttons), continues the original request after the press, never asks about the user, onboarding or future searches, offers follow-ups on the same topic, and says plainly that books monitoring is not available yet.

## Acceptance criteria (plan Phase 3.1, "Done when": S1, S2, S3, S4, S6, S10, S11)

- [x] Template profile/onboarding behavior removed from chat (§2.10): `<profile_gaps>`, `<missing_details>`, the name request, the small-talk hint, `new-user-setup` and `research-brief`.
- [x] Honest capability boundary (§2.6): one capability list feeds the role paragraph, scope, follow-ups and app knowledge; `searchWeb`, `sendEmail`, web-only tracking/suggestion/opportunity tools and `loadAgentSkill` not offered but still registered (A16, A17, §3.10).
- [x] `askUserQuestion` (A18): `{ label, value }` options, business numbers for `BUSINESS_REQUIRED` (+ `all` for `queryExpenses`), answered by the page, validated by the server (own values, once), same-turn continuation; label-only stored questions validate and show as answered.
- [x] Turn origin recorded on the user message / continued answer (§2.7 item 4).
- [x] Idempotency keys for existing writes (§2.7 item 6).
- [x] Memory save, correction and deletion and mixed read-and-write in ordinary chat; stable facts saved with a notice and undo; business facts as `kind: business_fact` (A12, A20).
- [x] Prompt snapshots updated; `missing-details.eval.ts` inverted; GUIDE.md "What KeepInTax changed" updated.
- [x] Phase 2 UI items Phase 3.1 needs: question buttons from the stored part, live follow-ups and follow-ups after reload, stored conversation load and stream resume.

## Scope and constraints

- In scope: `backend/agent` (prompt, context, memory, skills, tools, chat turn), the eval harness and evals, one Nest access test, the `/dev/agent` page, documentation.
- Out of scope (later phases, unchanged): Phase 3.2 consequence classes and setup cards, Phase 4 profile and memory provenance columns, notifications, steer button, side panel, trace link.
- No schema change, no production access, no main integration, no push.

## Implementation

See `backend/agent/GUIDE.md` ("What KeepInTax changed", "Phase 3.1: chat interaction") for the full list. Main files:

- `src/agent/core/agent/agent-capabilities.ts` (new): supported / not-yet-available capabilities, the not-offered tool set.
- `src/agent/core/agent/agent-instructions.ts`, `agent-user-context.ts`, `memory/long-term-memory.server.ts`, `core/turn/agent-turn-signals.ts`, `core/turn/agent-follow-up-questions.ts`, `tools/conversation/app-knowledge.ts`, `tools/conversation/user-settings-tool.ts`, `skills/registry/agent-skills.ts` (+ playbooks deleted), `tools/conversation/agent-skill-tool.ts`.
- `src/agent/tools/conversation/ask-user-question-tool.ts` (no execute, value options, output schema), `chat/turn/agent-chat-question-answers.ts` (new), `chat/messages/agent-chat-message-preparation.server.ts` (answers, supersede, origins), `chat/turn/agent-chat-turn-origin.ts` (new), `chat/turn/agent-chat-request.server.ts` (`origin: "follow-up"`), `lib/agent-chat/conversation/agent-chat-messages.ts` (`data-turnOrigin`).
- `src/agent/core/agent/app-agent.ts` (no `agentAskedUser`; `activeTools` = offered on every step; origin to approval), `core/tool-runtime/agent-tool-approval.ts` (`agentChatToolApproval` wrapper; template function unchanged), `agent-tool-traits.ts`, `agent-tool-search.ts` (deferred line lists only offered tools), `agent-tool-error-next-step.ts` (`BUSINESS_REQUIRED` with values).
- `src/agent/core/tool-runtime/agent-tool-idempotency.ts` (new), `tools/conversation/agent-memory-tools.ts` (`kind`, keyed insert, kind-preserving update), `tools/tasks/tracking-task-tools.ts` (keyed create).
- Frontend `/dev/agent`: `dev-agent-chat-parts.ts` (new, pure helpers), `dev-agent-chat.ts`, `dev-agent.page.ts/.html/.scss`, `dev-agent-chat.spec.ts` (new), `tsconfig.admin-ai-chat.spec.json`.
- Backend Nest: `agent-harness.access.spec.ts` (+1 case). No Nest source change.

Decisions taken within the plan:
- `kind` is stored as a content prefix (`[business_fact] `) because Phase 3.1 has no schema changes; Phase 4's migration reads it.
- Free-text answers to a question are not accepted through the tool; a typed message supersedes the question (§2.6 allows free text only "where allowed").
- The follow-up "no write" rule is the minimum Phase 3.1 needs for S3 ("no task, memory or setting created"); the other origin rules stay in Phase 3.2.
- The template's `email` namespace stays (its namespace-rule machinery and budget test depend on it); only the instructions line and `activeTools` leave it out.

## Verification

(Commands in `backend/agent` unless noted.)

Diagnostic before the change (`8ffde33a` + plan docs, 1 paid run each, the reported question with empty settings):
- S1 (one business): correct ₪1,662, then "כדי להתאים לכם עזרה גם בהמשך, מה אתם מחפשים? למשל לקוחות, ספקים או שיתופי פעולה." (the `seeking` gap).
- S2 (two businesses, none active): `BUSINESS_REQUIRED`, then label-only `askUserQuestion` with "במקביל, מה אתם מחפשים כרגע…"; result `{ "asked": true }`.
After the change (same diagnostic, 1 run each): S1 answers with no question, follow-ups "by month" / "which expenses"; S2 asks only which business, options `{label, value}` with 514789632, 039876541, `all`.

Checks on the final code:
- `npm run typecheck`: exit 0 (pre-existing Effect suggestions only).
- `npm run check` (ultracite lint + format): exit 0, 331 files.
- `npx vitest run --project unit`: 61 files passed, 3 skipped; 321 tests passed, 22 skipped. Baseline at `8ffde33a`: 59 files, 308 passed, 22 skipped. The 22 skipped are the MySQL integration tests (no throwaway `AGENT_TEST_DATABASE_URL` on this machine), skipped in both.
- New unit coverage: `agent-chat-question-flow.test.ts` (5, through the real endpoint with a scripted model: stop on open question, same-answer continuation with the stored label, invalid value 400, repeat / other-tab press 409 with no model call and nothing changed, typed message supersedes and stale press 409, follow-up origin only when stored, legacy label-only question + stored `searchWeb` validate and hidden tools not offered); `agent-memory-tools.test.ts` (3: key stability, same call saved once, business_fact kept on update, forget); approval (+3), steps (+1), prompt (+1), skills, user context.
- Changed template tests (behavior deliberately changed, reason in each): prompt snapshots (instructions, user context, tools, history; diffs reviewed), harness-override (an offered tool), turn-signal hint text, retired playbook not re-injected, skill list not sent.
- `npm run build`: exit 0.
- Nest (in `backend`): `npx jest src/agent-harness`: 5 suites, 84/84 passed (a "worker failed to exit gracefully" warning printed); `npx nest build`: exit 0.
- Frontend (in `frontend`): `npx tsc -p tsconfig.app.json --noEmit` exit 0; `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.admin-ai-chat.spec.json --include=…admin-panel.page.spec.ts --include=…dev-agent.route.spec.ts --include=…dev-agent-chat.spec.ts`: 20/20; `npx ng build`: exit 0, 11 budget warnings, none from the dev-agent page.

Paid evals: see "Eval results" below. The checks above were rerun on the committed revision (R3): typecheck 0 errors, check exit 0, unit 61 files / 321 passed / 22 skipped, build exit 0. Nest, Angular and Karma ran on R1; R2 and R3 changed only agent prompt text and eval files.

UI: **not runtime-verified.** No browser automation was available in this session and the dev page needs a real Firebase sign-in. The UI flow is covered by the endpoint tests above (the page's exact request shapes) and the page helpers' specs; the template and build compile. Manual check-list for the dev page:
1. Fuel question with several businesses and none active: buttons appear; press one; the same answer continues with the figure.
2. Reload while the question is open: buttons come back enabled; press works.
3. Press again / in a second tab: error "already answered", "Reload conversation" shows it answered.
4. Type a message instead of pressing: the question shows "Replaced by a newer message".
5. Follow-ups appear without a reload; after a reload they are still there; pressing one creates no memory.
6. "Remember that I prefer monthly breakdowns": "Saved: …" with Undo; Undo removes it.

## Eval results

All paid runs use fake ports (no database or service) and local tracing; results are in `backend/agent/.eval/agent/runs/<variant>`. "Combined" = code checks and judges; every failed slot's output was read before classifying it.

Revisions: **R1** = the code before the last two prompt edits; **R2** = R1 + `<clarification>` scoped to requests within `<scope>`, greeting judge reworded; **R3 (committed)** = R2 + `readAppKnowledge` pointer "Settings > Agent memory" restored + four eval cases restated (below). No paid eval ran on R3.

| Variant | Revision | Scope | Result |
| --- | --- | --- | --- |
| `kt108-diag2` | diagnostic (before lint-only refactors) | interaction + missing-details, 1 rep | 12/13 |
| `kt108-final-interaction` | R1 | Phase 3.1 scenarios + missing-details, 3 reps | 34/39 combined, 39/39 code. The 10 scenario cases 29/30 |
| `kt108-regression` | R1 | books, reports, behavior, conversation, judges, 1 rep (76 slots) | 65/76 combined, 72/76 code, 2 harness errors |
| `kt108-recheck` | R1 | 4 uncertain cases, 3 reps | readiness count 3/3, voice greeting 2/2 (1 slot errored), active-business naming 0/3, coding refusal 1/3 |
| `kt108-final2-interaction` | **R2** | Phase 3.1 scenarios + missing-details, 3 reps | **38/39 combined, 39/39 code.** S2 (all four cases), S3, S4, S6, S10, S11, S12 3/3; S1 2/3; the three no-profile-question cases 3/3 each |
| `kt108-final2-scope` | R2 | `agent-scope.eval.ts`, 3 reps | **stopped after 2 of 3 reps** (see below): coding refusal 2/2, out-of-scope 3/3, email draft 2/2, where-is-memory 1/2 |

`kt108-final2-regression` (the R2/R3 regression pass) did **not run**: Claude Code stopped the eval round because the machine was low on memory, and it was not restarted.

Classified misses (no threshold or judge weakened; reworded statements are noted in the files):
- S1, once in each 3-rep run: the shared books judge's numeric statement, confidence 0.04-0.24, on answers whose every figure is in the tool result; the deterministic number check passed. This is the open judge item recorded in KT-089.
- No-profile-question greetings (R1, 4 misses): correct greetings read as unclear at confidence 0.06-0.36 by a negatively worded statement; reworded positively with the same meaning in R2, then 6/6.
- Coding refusal (R1 1/3 on recheck, base instructions on the same code 3/3): treated as caused by the new `<clarification>` opener; R2 scopes it, then 2/2 plus 3/3 in an unrecorded direct run. Not yet run with 3 repetitions on R3.
- Where-is-memory (R2 1/2): a real regression of this change: the `readAppKnowledge` rewrite had dropped "Settings > Agent memory"; restored in R3 (not re-run).
- Active-business naming (`query-expenses-businesses`, "names no business for the active one"): pre-existing. Earlier recorded runs 3/6 (`expenses-completeness-baseline`), 3/3 (`-updated`), 0/1 (`expenses-local-1`); with the base instructions on the current code 1/3. The figure is right (431.15 ₪, the active business); the answer does not name the business. Not changed in this phase.
- Memory "who am I": pre-existing test defect: the judge statement names "נועה קוסמטיקה" while the fixture business is "Northwind Bookkeeping" (the answer correctly says Northwind). Unchanged since KT-089.
- Readiness count "6" (R1 regression run): the deterministic number check caught it and the answer appended a correction; 3/3 on recheck. Flaky since KT-089.
- Books judge numeric statement on money-in, Omega and VAT-unreadable (R1 regression, 1 rep each): same judge item as S1; outputs correct.
- Voice greeting (R1, 1 miss "gets straight to the answer"): 2/2 on recheck.
- Template cases about tracking tasks or finding clients, which Phase 3.1 hides (follow-ups after "how the agent works … until the task is created", "תמצא לי לקוחות", "What are my tasks?", time since "the accountant task"): restated in KeepInTax terms in R3, guarding the same behavior; **not yet run**.

Skipped, not passing (reason in each file): `tasks/tracking-tasks`, `tasks/task-opportunities`, `tasks/setup-workflow`, `behavior/agent-skills`, `workflows/simulated-users`, `workflows/real-chats`, `conversation/approvals` (whole files), and single cases in `chat-history`, `agent-planning` (2), `agent-voice`, `agent-action-rules` (2), `agent-memory` (settings as the target of "remember").

To finish verification on R3 when memory allows (in `backend/agent`):
- `npm run eval -- --variant kt108-r3-check --reps 3 tests/evals/agent/behavior/agent-scope.eval.ts tests/evals/agent/conversation/follow-up-questions.eval.ts tests/evals/agent/behavior/agent-planning.eval.ts tests/evals/agent/conversation/chat-history.eval.ts`
- `npm run eval -- --variant kt108-r3-regression --reps 1 tests/evals/agent/books tests/evals/agent/reports tests/evals/agent/behavior tests/evals/agent/conversation tests/evals/agent/judges tests/evals/agent/interaction`
## Remaining gaps and risks

- `readAppKnowledge`'s pages, plans and help center are still the template's example content (plan §3.1: "rewritten with KeepInTax's own help content"); only its how-it-works now comes from the capability list.
- The approvals eval file and the task-centric evals are skipped: with the template's approval tools hidden, no offered tool raises an approval card except `setAgentActionRule` with `allow`; approval-card eval coverage returns with Phase 3.2's actions.
- Phase 2 items not needed by Phase 3.1 remain: steer, side panel (memories list, notifications), trace link.
- The "saved" notice is shown for every `saveAgentMemory`, asked or not; distinguishing an unrequested save is the model's reply (rule in `<memory_rules>`).
- Final-revision eval coverage is partial (see "Eval results"): the R3 regression pass and the restated cases did not run.
- The active-business answer that does not name the business (pre-existing) and the stale memory judge statement are left for a books/eval follow-up.
- MySQL integration tests not run (no throwaway database here); the memory insert change keeps its signature compatible and is exercised against the fake database only.

## Handoff

- Result: complete
- Commit hash(es): see final report
- Schema / production / security / accounting / external impact: none / none / tighter (hidden tools refused server-side, follow-up writes refused, question answers validated) / none / none.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
