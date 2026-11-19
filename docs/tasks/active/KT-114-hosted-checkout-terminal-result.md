# KT-114 - Resolve terminal hosted checkout results safely

- Status: `PUSHED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt114\taxmyself-dev`
- Branch: `codex/kt114-hosted-checkout-terminal-result`
- Base commit: `6b5362325f490cdee192717f0a66107e18a25e0f`

## Business outcome

A customer whose CardCom hosted page definitively ended without a successful
charge can start payment again automatically, while ambiguous provider results
remain blocked against duplicate payment and expose useful sanitized diagnostics.

## Acceptance criteria

- [x] A non-successful CardCom LowProfile result is final only when it is safely
      correlated to the exact hosted attempt; transport, credential, malformed,
      foreign, or otherwise ambiguous responses remain unresolved.
- [x] A safely correlated final non-success result releases the active obligation
      through the existing decline transition and routes the owner back to the
      correct plans or recovery flow without creating a charge during status
      resolution.
- [x] Unknown reconciliation persists bounded provider response code and
      description where available and emits a clear token-free diagnostic log.
- [x] Existing verified capture, definitive transaction decline, idempotent
      completion, tenant scoping, and duplicate-payment protections are preserved.
- [x] Focused backend tests and the Nest production build pass.

## Scope and constraints

- In scope: CardCom hosted-result normalization, sanitized diagnostics, status
  resolution behavior, focused tests, and billing topic documentation.
- Out of scope: production data edits, schema changes, new CardCom endpoints,
  credentials, amounts, VAT, receipts, accounting, frontend redesign, deployment.
- Required reading: root and billing `AGENTS.md`, coordination workflow/authority/
  quality gates/lessons, CardCom LowProfile Create/GetLpResult documentation.
- Approval boundaries: preserve fail-closed behavior unless the provider response
  is correlated to the exact attempt; no production access or deployment.

## Handoff

- Result: complete
- Commit hash(es): source `d02926a6`; integration `7aa60eb6`
- Changed files: hosted-result validation, CardCom executor, provider runtime,
  attempt diagnostic persistence, three focused spec files, billing topic docs,
  and this task record.
- Tests and exact results: five focused Jest suites, 151/151 tests passed; final
  three directly affected Jest suites, 76/76 tests passed; Nest production build
  passed after the final code change.
- Known pre-existing failures: none in the executed checks. `npm ci` reported
  existing dependency audit/deprecation warnings only.
- Schema / production / security / accounting / external impact: no schema,
  production access/data, credential, provider-write, amount, VAT, receipt or
  accounting change. Security remains fail-closed for uncorrelated results.
- Risks and manual checks: after deployment, attempt 11 must be checked once.
  It will release only if CardCom echoes the exact stored checkout identity;
  otherwise the newly persisted response code/description must be reviewed.
- Documentation updated: `backend/src/billing/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager
- Integrated commit: `7aa60eb6`
- Combined verification: integration-tree focused Jest 3 suites / 76 tests
  passed; Nest production build passed; `git diff --check` and
  `git show --check` passed.
- `origin/main` verification: local `main`, `origin/main`, local/remote
  `codex/integration-kt114` and `git ls-remote` all matched
  `57150ad64b944c9768bb0bed553a2c62270dca3f` before this final status record.
- User-visible run instructions: after backend deployment, open the existing
  payment-status screen and click check again. A safely correlated terminal
  no-charge result returns to plan selection; otherwise inspect the newly saved
  provider code/description and keep the attempt blocked.
