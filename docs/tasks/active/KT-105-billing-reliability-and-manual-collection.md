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
- [x] A silently overdue ACTIVE subscription is materialized as one frozen debt
  and moved to PAST_DUE before recovery opens, without contacting CardCom; the
  billing-block dialog contains no unrelated open-banking action.
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
- [x] The dedicated billing QA profile is visible in admin subscriptions so the
  two manual charge actions can be exercised; every other demo stays excluded.
- [x] Saved payer details are presented as an editable payment profile, with the
  edit action labeled accurately and aligned to the visual left in the RTL card.
- [x] Customer debt recovery is a focused, branded payment page with one payment
  action; card-only replacement and verbose operational copy are removed.
- [x] Returning from an unfinished hosted checkout asks the backend to inspect
  the durable attempt read-only. Capture proceeds without redirect, a verified
  final decline may open one new page, and every unknown/pending result resumes
  the exact saved CardCom URL without creating a second charge attempt.
- [x] Focused backend/frontend tests, backend build and frontend production build
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
  additions and cumulative cutover SQL on 2026-11-09, and the paused production
  retry infrastructure on 2026-11-10. Provider calls, charges, schema changes,
  application deployment and activation of the paused resources still require
  separate authorization.

## Handoff

- Result: Feature implementation, dev acceptance and guarded production rollout
  complete. The keepintax-dev and keepintax-prod schemas were applied and
  verified, including durable hosted checkout URLs. Production release
  `r20261110-183344-0017` passed its full smoke suite; the charge-task revision
  passed candidate and public readiness before controlled activation.
- Commit hash(es):
- Changed files: billing backend/domain/task/CardCom/admin services and DTOs;
  customer settings, billing guards and admin subscription UI; schema runners,
  cutover SQL, focused tests and topic/feature documentation.
- Tests and exact results: backend focused billing suite 4 suites / 97 tests
  passed; full backend suite 232 suites / 2,416 tests passed on Node 22.22.2;
  frontend focused ChromeHeadless suite 10/10 passed; Nest build passed;
  Angular production build passed on Node 20.11.1 with existing non-fatal
  component/initial-bundle budget and CommonJS warnings; migration runner syntax
  and post-apply dev-schema verification passed.
- Known pre-existing failures: none in the executed release gates. Dependency
  audit findings and non-fatal Angular budget/CommonJS warnings remain separate
  follow-up work and were not auto-fixed during release verification.
- Schema / production / security / accounting / external impact: additive DDL
  applied in dev and production. All 11 production subscriptions with a stored
  payment method received an unverified version-1 payer profile; coverage is
  complete, one legacy profile lacks a source phone number, and no value was
  fabricated. `billing-charge-prod` is RUNNING and the hourly charge-repair and
  reconciliation jobs are ENABLED at minute 10 in `Asia/Jerusalem`. Revision
  `taxmys16elf-prod-00334-xzq` has 100% traffic with the charge-task environment.
  No task was dispatched and no CardCom call, charge, receipt or subscription
  transition occurred during provisioning or activation.
- Risks and manual checks: exercise hosted payer details, decline retry timing,
  payment-required routing, provider diagnostics, PAST_DUE settlement and
  independent one-off charging with CardCom test credentials before release.
- Manual fixture: the demo registry includes `billing-qa` with synthetic
  `ACTIVE_OVERDUE`, `PAST_DUE`, and `DECLINED` switches. Creating or switching
  the fixture is provider-free; direct login is required for access-block UI.
- Documentation updated: backend billing, admin billing, settings, guards,
  Cloud Tasks feature guide, cumulative migration and production cutover SQL.
- Production next steps: observe the first hourly repair/reconciliation run and
  normal renewal outcomes; have the one legacy customer complete the missing
  phone through billing settings when practical.

## Integration

- Reviewed by:
- Integrated commit: `032a169c` before production release; this rollout record
  follows as documentation-only integration.
- Combined verification: full release smoke, candidate readiness, public
  readiness, zero Cloud Run ERROR logs, empty charge queue before activation.
- `origin/main` verification: release source `032a169c` matched `origin/main`.
- User-visible run instructions:
