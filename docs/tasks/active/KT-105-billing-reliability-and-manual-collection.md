# KT-105 - Billing reliability and manual collection

- Status: `IN_REVIEW`
- Task manager: Codex primary integration manager
- Worker: Codex (isolated sequential worker)
- Worktree: `C:\Users\harel\.codex\worktrees\kt105\taxmyself-dev`
- Branch: `codex/kt-105-billing-reliability`
- Base commit: `2ad3a1f76c28f08993d266208007ea38e118907c`

## Business outcome

Customers whose payment needs attention see a payment-resolution message instead
of an incorrect plan-upgrade prompt. CardCom charges are traceable, carry the
customer's saved payer details, expose sanitized failure evidence to admins, and
use two controlled thirty-minute decline retries. Admins can separately settle a
PAST_DUE balance or create a VAT-inclusive one-off charge without altering a
healthy recurring subscription.

## Acceptance criteria

- [x] Overdue/failed payment access is represented explicitly and never opens the
  plan-upgrade dialog; the customer is directed to resolve payment.
- [x] A definitive recurring-card decline schedules at most two further charge
  attempts, each thirty minutes after the preceding decline; UNKNOWN/timeout
  outcomes are reconciled read-only and are never automatically charged again.
- [x] Retry delivery is durable and idempotent, uses a dedicated charging task
  boundary, and has a repair path for DB-commit/enqueue gaps.
- [x] Stale hosted checkouts no longer block a subscription indefinitely: after
  the approved timeout they are reconciled read-only and may expire/release only
  when there is no evidence of a transaction.
- [x] First hosted payment requires payer full name, identity/company number,
  email, phone and business number, prefilled where known; verified returned
  values become the versioned billing payer profile.
- [x] Future token charges send a frozen snapshot of that payer profile to
  CardCom; settings edits affect future attempts only.
- [x] Every provider request has structured, secret-safe logs proving whether it
  was prepared, sent, answered, not sent, or ended ambiguously.
- [x] Attempts retain sanitized CardCom response code/description and the admin
  subscription view displays the exact available failure reason and attempt
  history without exposing card tokens or personal payer data.
- [x] The existing misleading manual-renewal action is replaced by distinct
  actions: PAST_DUE debt settlement and an additional one-off charge.
- [x] Debt settlement displays all unpaid frozen periods and their VAT-inclusive
  total; a verified successful payment settles them and changes only PAST_DUE to
  ACTIVE. CANCELED is never reactivated.
- [x] A one-off charge requires VAT-inclusive amount, reason/description and
  consent evidence; it creates an independent obligation/receipt/audit trail and
  never changes subscription status, dates, plan or retry counters.
- [x] Saved-card admin attempts happen once; a decline requires a secure hosted
  CardCom link for a new payment method. Admins never receive raw card details.
- [ ] Focused backend/frontend tests, backend build and frontend production build
  pass, and billing documentation plus cumulative cutover SQL are updated.

## Scope and constraints

- In scope: backend billing domain/services/controllers/entities; CardCom request
  mapping; Cloud Tasks retry transport; billing access response; admin billing
  and customer settings UI; billing schema/cutover SQL; focused tests/docs.
- Out of scope: live CardCom calls, production database access, deployment,
  changing plan prices, adding VAT on top of displayed amounts, reactivating
  CANCELED subscriptions, or changing receipt accounting semantics.
- Required reading: root and billing/admin-billing/guard topic `AGENTS.md` files;
  `docs/coordination/WORKFLOW.md`, `AUTHORITY.md`, `QUALITY_GATES.md`;
  official CardCom LowProfile result and direct token-charge documentation.
- Approval boundaries: Elazar explicitly approved the business behavior, schema
  additions and cumulative cutover SQL on 2026-11-09. Production/external calls
  remain prohibited.

## Handoff

- Result: Feature implementation complete and ready for final review/manual dev
  acceptance. The keepintax-dev schema was applied and verified on 2026-11-09;
  no provider request or customer charge was made.
- Commit hash(es):
- Changed files: billing backend/domain/task/CardCom/admin services and DTOs;
  customer settings, billing guards and admin subscription UI; schema runners,
  cutover SQL, focused tests and topic/feature documentation.
- Tests and exact results: backend focused suite 6 suites / 59 tests passed;
  frontend focused ChromeHeadless suite 10/10 passed; backend and frontend
  TypeScript compilation passed; Nest build passed; Angular development build
  passed; migration runner syntax and post-apply schema verification passed.
- Known pre-existing failures: Angular production build remains to be recorded;
  this repository has existing unrelated component-style budget failures.
- Schema / production / security / accounting / external impact: additive
  keepintax-dev DDL applied only. Production remains untouched. No CardCom calls,
  charges, receipts or subscription transitions were executed during validation.
- Risks and manual checks: exercise hosted payer details, decline retry timing,
  payment-required routing, provider diagnostics, PAST_DUE settlement and
  independent one-off charging with CardCom test credentials before release.
- Manual fixture: the demo registry includes `billing-qa` with synthetic
  `ACTIVE_OVERDUE`, `PAST_DUE`, and `DECLINED` switches. Creating or switching
  the fixture is provider-free; direct login is required for access-block UI.
- Documentation updated: backend billing, admin billing, settings, guards,
  Cloud Tasks feature guide, cumulative migration and production cutover SQL.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
