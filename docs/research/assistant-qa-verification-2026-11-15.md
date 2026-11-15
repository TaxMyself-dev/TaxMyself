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
