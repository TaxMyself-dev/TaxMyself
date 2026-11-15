# Assistant QA verification — 2026-11-15

Point-in-time verification of the KeepInTax assistant (Phase 3.1, KT-108)
against the dedicated demo user described in
[`docs/operations/assistant-qa-demo.md`](../operations/assistant-qa-demo.md).
Verification only: no implementation code, accounting data, demo seed, `main`,
push or deployment was changed.

**Result: the suite did not pass.** 18 of 24 scenarios passed and 6 failed: one
high severity (S20, wrong business), two medium (S13, S17) and three low
completeness failures (S10, S14, S16). None were blocked or skipped.
`agent-instructions.ts` below means
`backend/agent/src/agent/core/agent/agent-instructions.ts`.

## 1. Revision, environment, method

| Item | Value |
|---|---|
| Worktree / branch | `TaxMyself-new-ai-assistant`, `new-ai-assistant` |
| HEAD | `1d4df873` (docs only on top of `a75c1fcb` demo data and `f9b46bcf` KT-108) |
| Working tree | Unchanged pre-existing untracked files (timing file, three plan drafts) |
| Backend | `localhost:3000`, this worktree's `backend/dist/main`, started 12:28:59 local |
| Agent bundle | `backend/agent/dist/agent-http.mjs` built 09:54; no agent source file is newer, so it matches `f9b46bcf` |
| Frontend | `ng serve` from this worktree, `localhost:4200`, page `/dev/agent` |
| Database | `keepintax-dev` on the shared dev host (checked with `SELECT DATABASE()`); never production |
| Model | `gpt-6-luna` (from `agent_usage`) |
| Langfuse | Not running (port 3100 closed); traces unavailable, evidence taken from stored chat parts |
| Execution | 13:13–13:28 local (≈15 min of chat runs), 2026-11-15 |
| Model calls | 45 answer runs / 87 model steps recorded in `agent_usage` for this user during the run (≈575k input, ≈7.5k output tokens). Follow-up and title generation are not recorded there, so the true call count is higher |

**Method.** Every scenario ran through the real Angular UI in headless Chrome
(Playwright-core, the system Chrome install, scratchpad-only dependency). Steps:
UI login with the demo credentials, then `/dev/agent`. Messages were typed into
the composer and sent with Enter. Question buttons and follow-up chips were
clicked, the page was reloaded, and the memory "Undo" button was used. The active
business was set through the app's own `AuthService.setActiveBusinessNumber`.
The dev page has no business picker, and that signal is what the app's business
selectors set. Tool inputs, outputs and texts were read from the page's chat
state and cross-checked against `agent_chat_messages`. No domain service or
agent API was called directly. Read-only SQL was used only for the fixture
check, the memory/task state and usage counts.

> **Correction (follow-up investigation, see §8).** "That signal is what the
> app's business selectors set" is inaccurate. No dedicated business selector
> sets it, and nothing sets it on login. It is set as a side effect of
> particular row actions and dialogs, persists across in-app navigation and is
> cleared by a full page load. The programmatic setting was therefore test
> instrumentation. In S1–S20 and S22–S24 every chat request carried
> `businessnumber: 999100012`. S20's failure was later reproduced without any
> instrumentation (§8.1), so the S20 verdict stands.

## 2. Fixture validation

A read-only check before and after the run matched the documented fixture
exactly, and the before and after snapshots were identical. Fixture drift: none.

- Main fuel: 7 booked, 2,360 total, VAT 240, tax-recognized 954. Monthly totals 354/590/826/590; one pending 118.
- Suppliers (main): North 1,652, South 708. Second business: fuel 708 (tax-recognized 318.60).
- Phone 472 (4); software + office booked 1,770 (software 708, office 1,062); pending office 236; private 354 outside the books.
- Issued documents: main 4 TAX_INVOICE_RECEIPT, net 7,000 / VAT 1,260 / gross 8,260; Alpha 3,000/3,540, Beta 4,000/4,720. Exempt business: 3 receipts of 500.
- Clients: Alpha, Beta, "ללא מסמכים" (main); Gamma (second).

## 3. Scenario results

Evidence IDs are the run files under the git-ignored
`.local/assistant-qa/verification-2026-11-15/` (`diag/`, `main/`, `rerun/`,
`cleanup/`), each with JSON (messages, tool parts, DOM state) and a screenshot.
All scenarios ran in the browser.

| ID | Actual (summary) | Expected | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `queryExpenses` search דלק, 2026-01-01..11-15. 2,360; pending 118 excluded. D2 run: 7 expenses, VAT 240, tax 954 | 2,360 incl. VAT, 7, pending 118 excluded | PASS (D1 text omitted the count and "incl. VAT"; D2/S22 included them) | diag/D1, diag/D2, main/S22 |
| 2 | groupBy month: Aug 354, Sep 590, Oct 826, Nov 590; total 2,360 incl. VAT; pending excluded | same | PASS | main/S02 |
| 3 | supplier filter: 1,652 incl. VAT, 4 expenses, main business only (second business's 708 not leaked) | 1,652 main only | PASS (answer does not name the business) | main/S03 |
| 4 | 708, 3 expenses, main business named | 708 | PASS | main/S04 |
| 5 | 954 tax-recognized, explicitly distinguished; pending excluded | 954 | PASS | main/S05 |
| 6 | 240 input VAT; pending 118 (VAT 12) excluded | 240 | PASS | main/S06 |
| 7 | 472, 4 expenses | 472, 4×118 | PASS | main/S07 |
| 8 | 708 incl. VAT, 600 tax-recognized | 708 / 600 | PASS | main/S08 |
| 9 | 1,062; pending 236 excluded | 1,062 / 236 pending | PASS (no follow-ups, see §5) | main/S09 |
| 10 | 3/3 runs: "2 pending, 354". Never itemized fuel 118 / office 236 (no rows or grouping requested) | 2 = 354: fuel 118 + office 236 | FAIL (low, completeness) | main/S10, rerun/S10_r2, S10_r3 |
| 11 | 4,602, 17 expenses; 2 pending 354 and private 354 excluded | 4,602 / 17 / private excluded | PASS | main/S11 |
| 12 | `getProfitAndLoss`: income 7,000 before VAT, recognized 2,567.52 by section, profit 4,432.48; pending and depreciation caveats | 7,000 / 2,567.52 / 4,432.48 | PASS | main/S12 |
| 13 | 3/3 runs: turnover 3,500, input 333, payable 297. **Output VAT 630 never given** | 3,500 / 630 / 333 / 297 | FAIL (medium) | main/S13, rerun/S13_r2, S13_r3 |
| 14 | 4 documents listed with gross each; gross 8,260 (3/3); net 7,000 in 2/3; **VAT 1,260 in 0/3** | 4 docs, 7,000 / 1,260 / 8,260 | FAIL (low, completeness) | main/S14, rerun/S14_r2, S14_r3 |
| 15 | 2 documents (Aug, Oct), 3,540 gross, 3,000 net | same | PASS | main/S15 |
| 16 | 2 documents (Sep, Nov) correct in 3/3. Gross 4,720 in 2/3, no total in 1/3, **net 4,000 in 0/3** | 2 docs, 4,000 / 4,720 | FAIL (low, completeness) | main/S16, rerun/S16_r2, S16_r3 |
| 17 | "No documents" correct 3/3. Never checked `listClients`; 2/3 runs suggest the client itself was not found ("אין התאמה לשם הזה", "לא נמצאו לקוחות תואמים") | No documents; the client exists | FAIL (medium, misleading) | main/S17, rerun/S17_r2, S17_r3 |
| 18 | `listClients`: Alpha, Beta, "ללא מסמכים"; Gamma not shown | same | PASS | main/S18 |
| 19 | `allBusinesses`: main 2,360 + second 708 = 3,068 | same | PASS | main/S19 |
| 20 | 3/3 runs: `getProfitAndLoss` without `businessNumber` read the **active main business** and answered 7,000 / 2,567.52 / 4,432.48. One run said "in the business you named" | 1,500 / 318.60 / 1,181.40 for ייעוץ הדגמה - פטור | **FAIL (high)** | main/S20, rerun/S20_r2, S20_r3 |
| 21 | No active business: `BUSINESS_REQUIRED` led to `askUserQuestion` with buttons for both businesses plus "both". No onboarding questions. After reload: same chat (`?chat=`), buttons still enabled. Pressing the main business re-ran with the same range/filter plus `businessNumber`: 2,360 / VAT 240 / tax 954 / pending 118 | buttons, completes correctly, survives reload | PASS | diag/D2 |
| 22 | "תפרט לפי חודשים" kept the fuel context: 354/590/826/590. Live follow-ups appeared, and clicked chips (monthly; by supplier) answered correctly (North 1,652 / South 708). `tracking_tasks` stayed 0 | monthly figures, context kept, no task | PASS | diag/D1, main/S22, main/S22b |
| 23 | `saveAgentMemory` {"content":"מעדיף פירוט חודשי","kind":"preference"} saved one DB row. Recall correct in the same chat and in a fresh chat. No onboarding, no monitoring | saved and retrieved | PASS | rerun/S23_memory |
| 24 | "Alerts on changes aren't possible right now", offered a current check. No tool call, no task, no web search | explain unavailable, no false monitor | PASS | main/S24 |

Supplementary probe (not a scenario): S20's question with the **exempt business
active** returned 1,500 / 318.60 / 1,181.40, which is correct
(`cleanup/S20_probe_exempt_active`). The P&L tool is correct, so the defect is
business routing.

## 4. Failures by likely shared cause

### A. A named non-active business is ignored by single-business report tools (S20). High

- **Repro:** active business 999100012, fresh chat, ask "מה ההכנסות והרווח בעסק ייעוץ הדגמה - פטור בשנת 2026?".
- **Expected:** P&L of 999100020: 1,500 / 318.60 / 1,181.40.
- **Actual (3/3):** the model searched for `getProfitAndLoss` and called it with
  `{"from":"2026-01-01","to":"2026-11-15"}` and no `businessNumber`. The result was
  `business: 999100012`, income 7,000, net 4,432.48. The answer reported those
  figures, correctly labelled as the main business, without saying the named
  business was not read.
- **User impact:** the user gets another business's profit in reply to a
  question about a named business. The answer check passes because the numbers
  match a tool result. Any read except `queryExpenses` is likely affected
  (VAT, advances, documents, clients, transactions).
- **Likely cause:** `agent-instructions.ts:66` says to take a named business's
  number "from business or otherBusinesses in a result". `getProfitAndLoss`
  (and `getVatSummary`) return only `business`, with no `otherBusinesses`, and
  in a fresh chat no earlier result exists. The model therefore cannot resolve
  the name, and nothing makes it notice that the business it read differs from
  the one named. Output shape: `backend/src/agent-harness/agent-books.service.ts`
  (P&L/VAT views).
- **Correction (§8):** the repro above used programmatic business selection.
  §8.1 gives an ordinary-UI reproduction, and §8.2 separates what is confirmed
  from what is inferred. The fix recommended in §7 item 1 is superseded by §8.4.

### B. `getVatSummary` does not return output VAT (S13). Medium

- **Repro:** active main business, "מה סיכום המע״מ לספטמבר–אוקטובר 2026?".
- **Actual (3/3):** the tool result has `salesSubjectToVat 3500`,
  `inputVatOnExpenses 333` and `vatToPay 297`, but no output-VAT field. The answer
  never states 630. Under the evidence rules the model cannot derive it.
- **Cause (established):** the report builder supplies `vatOnTurnover`.
  `agent-books.service.ts:896-901` maps turnover, exempt sales, input VAT and
  payment but leaves `vatOnTurnover` out. The port type
  (`agent-domain.types.ts:404`, `backend/agent/src/agent/core/ports/keepintax-ports.ts:442`)
  has no field for it either.
- **Impact:** a VAT summary without output VAT is incomplete for reporting.

### C. Document "no match" is presented as if the client might not exist (S17). Medium

- **Actual:** `queryIssuedDocuments` with the client filter returns `count 0`,
  `matchedClients: []` and `clientsInRange: [Alpha, Beta]`. The model never calls
  `listClients`. In 2/3 runs it says there is no match for the name or no
  matching clients. That is misleading: the client is saved.
  `backend/agent/GUIDE.md` notes that "No document match does not establish
  whether a saved customer exists".
- **Likely location:** the `matchedClients` naming and description in the
  issued-documents tool schema (`backend/agent/src/agent/tools/books/`), and the
  instructions, which do not require a `listClients` check before discussing
  whether a client exists.

### D. Answer completeness with figures the tool did return (S10, S14, S16). Low

- S14: `byType` holds `totalBeforeVat 7000` and `vat 1260`, yet VAT is never stated
  and net only sometimes. S16: net 4,000 is never stated, and one run gives no
  total at all. S10: the call uses `includeRows:false` with no grouping, so the
  pending split is never fetched.
- **Impact:** the numbers given are correct, but users don't get the net/VAT
  split of income documents or the composition of pending items. The output
  varies from run to run.
- **Likely location:** the issued-documents and pending guidance in
  `agent-instructions.ts` (`<books>`). Unlike reports, nothing requires
  net/VAT/gross for documents or itemizing a small pending set.

## 5. Classification

- **Confirmed defects:** A (S20, 3/3), B (S13, 3/3, code-level cause), C (S17,
  3/3 never confirms the client; 2/3 misleading).
- **Completeness failures / judge uncertainty:** D (S10, S14, S16). The core
  amounts are always right. I marked them FAIL because the expected results list
  those figures. If the owners consider them optional detail, they become PASS.
  The expected outcomes have not been weakened here.
- **Intermittent:** live follow-ups were missing on 2 of 42 answer turns (S09, and
  the memory-save turn). Those turns finished in 3.6–4.8 s, and no
  `data-followUps` part was ever stored. Cause not established; server logs and
  Langfuse were not available. Also, after a clicked supplier follow-up, the
  suggestions offered the monthly breakdown that had just been answered (minor).
- **Fixture drift:** none.
- **Environment:** Langfuse down (no traces). The dev page renders Markdown
  (`**`) as raw text (dev page only, cosmetic). After a reload the active
  business resets to none because it is an in-memory signal. That did not
  affect S21, because the press carries the business.

## 6. Persistent changes and cleanup

- **Memory:** before the run, 0 memories. S23 created one
  (`1298898d…`, "מעדיף פירוט חודשי"). It was removed through the page's Undo
  (`deleteAgentMemory`), back to 0. No other memory was touched.
- `tracking_tasks` 0 and `user_notifications` 0, before and after.
- Accounting data: unchanged (the before and after fixture snapshots are identical).
- Left in place, not authorized to delete: 39 new test conversations for the
  demo user (1 to 40 in `agent_chat_conversations`), plus their messages and
  `agent_usage` rows.
- Local-only: evidence in `.local/assistant-qa/verification-2026-11-15/`
  (git-ignored) and a headless-Chrome profile in the session scratchpad.

## 7. Recommended next fixes (not implemented)

1. **A:** resolve named businesses for every single-business read. Options:
   return `otherBusinesses` from all books/report tools, or expose the owner's
   businesses (names and numbers) in the turn context. Also instruct, and
   ideally check, that when a business is named the answer is refused or
   re-read if `result.business` differs from it. Add an eval: "P&L of the named
   non-active business".
2. **B:** add `outputVat` (`vatOnTurnover`) to the VAT summary port, the service
   mapping and the tool description, with a unit test and a VAT eval asserting
   630.
3. **C:** rename or document `matchedClients` as "clients matched among
   documents". Instruct the model to call `listClients` before saying anything
   about a client's existence, and to state "the client exists, no documents".
4. **D:** in the `<books>` instructions, require net/VAT/gross for issued-document
   totals. When pending items are few, request `groupBy` category or rows and
   itemize them.
5. Investigate the occasional missing follow-ups. Log the follow-up writer's
   outcome per answer and record it in `agent_usage` so call counts are complete.

## 8. Follow-up investigation of S20 (2026-11-15, later the same day)

This was a read-only investigation, and no code had changed: HEAD was still
`e27fd5ad` (this report only). The backend served the original runs from the
same process (started 13:12:34) and the agent bundle was still the 09:54 build.
I checked `keepintax-dev` before running anything. Five bounded model runs
were made: A 1, B 1, C 2, N 1 (`agent_usage` went from 55 to 60 answers). One
answer run that was not mine was recorded between the two sessions. Evidence is
under `.local/assistant-qa/verification-2026-11-15/inv/`.

Product clarification received: chat must not require an active business. It
should resolve a named business, use conversation context, show buttons when
the business is ambiguous, and never silently substitute another business.

### 8.1 Is the S20 state reachable without instrumentation?

**Code.** `AuthService.activeBusinessNumberSig` is an in-memory signal
(`frontend/src/app/services/auth.service.ts:193`). The global
`interceptors/auth.interceptor.ts:70-83` sends it as the `businessnumber` header
on every API call. The chat page (`dev-agent.page.ts:120`,
`dev-agent-chat.ts:58-65`) reads it per request.

Nothing sets it on login or on entering `/dev/agent`. It is set as a side effect
of row actions and dialogs, for example `my-account.page.ts:1250` (classify a
transaction), `transactions.page.ts:793`, `expenses.page.ts:424` (edit expense),
the manual-expense dialog, suppliers, the clients panel, depreciation,
flow-analysis and the archived documents page. It is cleared on delegated-client
exit. It survives in-app navigation, a "New chat" and business switches, and is
lost on a full page load. The chat page shows it only as the text "active
business:"; the chat has no selector.

**Observed** (headless Chrome, ordinary clicks only, `inv/N0_dry`):

| Step | Chat page shows |
|---|---|
| Login, then open `/dev/agent` (full page load) | `active business: none` |
| Landing page: hover over the main-business row, choose "סיווג תנועה", close the dialog unsaved, then the "פאנל ניהול" nav link and its "צ׳אט AI" tab (in-app navigation) | `active business: 999100012` |
| Full page load of `/dev/agent` again | `active business: none` |

Run **N** (`inv/N_natural_ui_path`) then asked the S20 question in that
ordinary-UI state. `getProfitAndLoss {"from":"2026-01-01","to":"2026-11-15"}`
returned 999100012, and the answer was 7,000 / 2,567.52 / 4,432.48, the wrong
business.

**S20 is reachable without instrumentation**, through the current (dev-only)
chat entry point, as a hidden side effect of an unrelated action. The original
instrumentation was not identical to that journey, but it produced the same
request state. Opening and closing the classify dialog only reads categories
(`classify-tran.component.ts:340`). The fixture was unchanged afterwards; the
client rows differed only in order.

**Conclusions that still hold:** S1–S19 and S22–S24 measured the assistant with
the header set to the main business. That is a reachable state, but not the
only one. With no header and several businesses, every single-business read
fails with `BUSINESS_REQUIRED` and the model asks (S21 shows this path). Those
scenarios' amounts are valid for the header-present state. They do not show how
unnamed questions behave without one, which by the clarified intent should be a
button choice.

### 8.2 Why the named business did not determine the tool call

Same question in all runs. Expected business 999100020: 1,500 / 318.60 / 1,181.40.

| Run | Context | `getProfitAndLoss` input | Outcome |
|---|---|---|---|
| Original S20 ×3, **B** | instrumented header 999100012, fresh chat | no `businessNumber` | 999100012 figures, wrong (4/4) |
| **N** | ordinary-UI header 999100012, fresh chat | no `businessNumber` | wrong (1/1) |
| **A** | no header (full page load), fresh chat | no `businessNumber` | `BUSINESS_REQUIRED`, then buttons for both businesses although the user named one; not pressed (1/1) |
| **C** | header 999100012, after a `queryExpenses` turn whose result listed `otherBusinesses` | `businessNumber: "999100020"` | 1,500 / 318.6 / 1,181.4, correct (1/1) |

**Confirmed by code and stored parts:**

- In a fresh chat the model has no business names or numbers. The stored
  `data-userContext` contains only settings ("Account: private person",
  "Languages: en") and memory. There is no business list in the instructions,
  and the `getProfitAndLoss` schema (`books-tool-schema.ts:13-17`) says to take
  a number "from business or otherBusinesses in an earlier result; left out,
  their active one". `agent-instructions.ts:66` says the same.
- The only reads that return `otherBusinesses` are `queryExpenses`,
  `queryTransactions` and `queryIssuedDocuments` (`agent-books.service.ts:272,
  642`; `agent-domain.service.ts:498`). P&L and VAT results return only
  `business`. `listUpcomingReports` lists every business, but nothing directs
  the model to use it for discovery. **No documented way exists to discover the
  businesses before the first read.**
- The backend fills in the header without knowing the user's intent:
  `chooseBusiness` uses `asked ?? user.businessNumber`
  (`agent-domain.service.ts:524-533`). The header is only checked for
  ownership (`requestBusiness`, `:289-301`).
- Nothing checks that the business returned matches the business named. The
  books answer check compares numbers against successful results of the same
  turn, so the wrong-business figures pass it.
- With no header, the backend does **not** substitute a business: it raises
  `BUSINESS_REQUIRED` listing both names and numbers. The next-step text
  (`agent-tool-error-next-step.ts:37-41`) unconditionally says "Ask which one…
  Ask nothing else", so the model asked even though the error had just given it
  the named business's number.
- C succeeded because an earlier result in the conversation carried
  `otherBusinesses: [{999100020, ייעוץ הדגמה - פטור}]`, exactly the source the
  schema and the instructions point to.

**Inferred, not proven:**

- Why the model omits `businessNumber` rather than asking or saying it cannot
  tell. The most consistent explanation is that it has no number for the name,
  and instructions line 66 forbids picking one from a list.
- A, C and N ran once each. Runs could differ, for example by A choosing
  999100020 from the error without asking, or C omitting the number. The 4/4 and
  1/1 wrong-business runs show the behavior is consistent, not that it is
  certain.
- The same pattern is expected for `getVatSummary`, `getAdvanceTaxStatus`,
  `getReportReadiness` and `listClients`, which have the same schema and
  resolution, but it was not run.
- I did not see the user's own longer conversation. C reproduces the described
  mechanism; I did not inspect that conversation.

### 8.3 Does the active business belong in chat?

Under the clarified intent, it should not be the tool default. In the app it is
a hidden, page-level side effect, set by whichever row action ran last and
invisible in chat. It survives navigation and silently decides which books are
read, which is exactly the substitution the product forbids.

It must stay for the rest of the application, though. `FirebaseAuthGuard`
(`guards/firebase-auth.guard.ts:63-72`) exposes it as `request.user.businessNumber`,
which `expenses.controller.ts` (e.g. `:51, :92, :349, :409, :541`),
`bookkeeping.controller.ts` (`:42, :76, :242, :278, :295`) and
`reports.controller.ts:684` use as their fallback. On the frontend the manual
expense, classify-transaction, annual-report and SHAAM dialogs read it. **Do
not remove it globally; stop chat from depending on it.**

### 8.4 Minimal change (replaces §7 item 1)

1. **Business directory in the turn context.** When the owner has more than one
   numbered business, the server adds the verified owner's numbered businesses
   (name and number, from `ownerBusinesses`) to the per-turn context. Names then
   resolve before the first read.
2. **Conversation business instead of the request header.** For agent tools,
   `chooseBusiness` resolves in this order: explicit `businessNumber`, then the
   conversation's current business (a number the user named or pressed earlier
   in this conversation, kept server-side;
   `agent_chat_conversations.business_number` already exists as "the business
   the conversation started in"), then the only business, then
   `BUSINESS_REQUIRED`. The page's `businessnumber` header is ignored by agent
   tools, or kept only as an ownership-checked hint, never as a silent default.
   It stays unchanged for the rest of the app.
3. **Intent-aware clarification.** `BUSINESS_REQUIRED`'s next step: "if the
   user's message names one of these businesses, read again with its number;
   otherwise ask". Rewrite instructions lines 66 and 70 to cover named
   businesses, conversation context and asking only when ambiguous.
4. **Result check.** When the user's text names a business in the directory,
   reject or flag an answer whose read `business.number` differs, so silent
   substitution cannot pass the answer check.

Step 2's conversation business is the only stored state. It adds no schema
change if the existing column is reused, which is a decision for the agent
owner. No user-facing selector is needed.

### 8.5 Tests to correct or add

- **Correct or adjust:**
  - `agent-domain.service.spec.ts:499` ("reads the active business; switching it
    mid-conversation moves the default") encodes the header default that §8.4
    replaces; restate it for the conversation business.
  - `agent-books.service.spec.ts:1135` (`listUpcomingReports` `activeBusiness`
    "the verified one") and `:256` (asks when none is active) must follow the
    new resolution order.
  - `agent-domain.service.spec.ts:319/326` (`requestBusiness` header ownership)
    stay valid for the non-chat app.
- **Add (unit):**
  - With a header and an explicit different `businessNumber`, the explicit one
    is read, for every single-business read.
  - With a header and several businesses, an agent tool without
    `businessNumber` and without a conversation business returns
    `BUSINESS_REQUIRED`.
  - The directory lists only the owner's numbered businesses.
- **Add (evals, `reports.eval.ts`, `books-reads.eval.ts`,
  `chat-interaction.eval.ts`); the current cases always set `active:`:**
  - Fresh chat with a named non-active business, with and without a header, for
    P&L, VAT, issued documents and clients. Assert `businessNumber` equals the
    named business, no `askUserQuestion`, and figures from that business.
  - An unnamed question with no conversation business leads to a question with
    buttons.
  - A follow-up such as "ובעסק השני?" uses the conversation context.
- **Frontend:** `dev-agent-chat.spec.ts` should assert whatever header policy is
  chosen for chat requests.
- **QA instructions:** `docs/operations/assistant-qa-demo.md` says to select the
  main business first. There is no user-facing way to do that. This report
  notes it; that document belongs to its task owner and was not edited.

## 9. Business-selection fix and verification (2026-11-15, evening)

Implements §8.4 for business selection only; the other findings of §4 (S13
output VAT, S17 client existence, completeness) are not addressed here. Task
record: `docs/tasks/active/assistant-business-selection.md`; design:
`backend/agent/GUIDE.md` "Business selection".

**Schema incident (repaired).** While restarting the backend for live checks,
a plain `node dist/main` start booted with `synchronize=true` against
keepintax-dev (~15:00); schema sync failed on `subscription` and the process
was killed. Table creation times showed `typeorm_metadata` created and
`user`, `subscription` and `transactions` rebuilt. The pricing schema was
then repaired by Codex after a backup: the 4 missing pricing columns and 3
CHECK constraints were restored from their original migration, all 41
subscription rows kept their values, and migration verification passed.
Afterwards every backend start set and verified `DISABLE_SYNCHRONIZE=true`,
`SKIP_BOOT_SEED=true` and `DB_DATABASE=keepintax-dev` (boot log
`synchronize=false`), on a port nobody else used. Evidence:
`.local/.../incident-2026-11-15-synchronize/`.

**Live results** (browser, ordinary UI; backend port 3012, frontend 4210):

| Scenario | Result |
|---|---|
| L1: page context 999100012 (set by the ordinary classify-dialog path; the app's own requests carried it), fresh chat asks P&L of "ייעוץ הדגמה - פטור" | PASS: `getProfitAndLoss` with `businessNumber` 999100020; 1,500 / 318.6 / 1,181.4 |
| L2: fresh chat, fuel, no business named | First run FAIL: the model read `allBusinesses` and gave 3,068. After one instruction correction (never widen an unnamed question to all businesses; ask): PASS: `BUSINESS_REQUIRED`, three buttons, press main business: 2,360, pending 118 excluded |
| L3: same chat, "תפרט לפי חודשים", then fuel in "ייעוץ הדגמה - פטור" | PASS: main 354 / 590 / 826 / 590; then 999100020: 708 |

Six model answer turns. No memory, task or accounting change (fixture
identical). Deterministic coverage (unit and Nest specs) is listed in the
task record. Remaining: the evals' fakes still emulate the old header
default and were not run.
