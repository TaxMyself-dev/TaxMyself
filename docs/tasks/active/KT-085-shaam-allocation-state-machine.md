# KT-085 - SHAAM allocation state machine

- Status: `APPROVED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt085\taxmyself-dev`
- Branch: `codex/kt085-shaam-allocation-state-machine`
- Base commit: `6c025dc9`

## Business outcome

Invoice allocation follows the Tax Authority's supplier-side Approval flow,
records every submission durably, prevents duplicate requests after an
ambiguous outcome, and explains each state clearly to users and operators.

## Acceptance criteria

- [ ] Remove customer-side Invoice Information recovery from the supplier
      allocation path; a first request calls only `Invoices/v2/Approval`.
- [ ] Persist a per-document attempt history before each external submission,
      including an opaque request id, payload hash, state, lease, bounded HTTP
      status/failure metadata, timestamps and initiating actor.
- [ ] Enforce one active/ambiguous attempt per document. A live lease reports
      in-progress; an expired lease becomes `UNKNOWN_OUTCOME`; neither state
      submits another Approval automatically.
- [ ] Persist a successful allocation number and terminal attempt state in one
      database transaction before PDF/journal finalization. A finalization
      retry must never call SHAAM again.
- [ ] Map provider rejection, deterministic client/auth/validation errors and
      ambiguous transport/server/malformed outcomes to distinct safe states.
- [ ] Provide admin-only, audited resolution for an unknown outcome:
      confirmed-not-accepted permits an exact same-document retry; a confirmed
      allocation number is stored before local finalization. Normal users
      cannot resolve unknown attempts.
- [ ] Expose sanitized allocation status to the document UI and present clear
      actions/messages for ready, processing, unknown, rejected/failed,
      allocated and local-finalization states.
- [ ] Emit structured stage/state-transition logs without tokens, request or
      response bodies, VAT/business/customer numbers, document references,
      allocation numbers, dates or monetary values.
- [ ] Add an idempotent schema section to `docs/redesign/cutover.sql`, but do
      not execute it against any database.
- [ ] Document the Tax Authority supplier/customer boundary and include a
      Mermaid flow diagram covering every outcome.
- [ ] Focused backend and frontend tests plus Nest and Angular production builds
      pass.

## Scope and constraints

- In scope: SHAAM invoice-allocation orchestration/client/controller, durable
  attempt entity and cutover SQL, pending-document UI and admin resolution UI,
  focused tests, topic documentation and a feature flow document.
- Out of scope: live Tax Authority calls, database execution, production data,
  deployment, changes to invoice totals/VAT/journal calculations, and assuming
  undocumented Approval replay idempotency.
- Explicit approval: Elazar approved the schema change, admin resolution path,
  and API/UI contract update on 2026-10-21.
- Required reading: root `AGENTS.md`, coordination workflow/authority/gates,
  SHAAM/Documents/guards/admin/incomes/doc-create topic docs, and official Tax
  Authority Invoice Israel API guidance.
- Approval boundary: stop if implementation would require automatic replay of
  an unknown request or a change to accounting/tax calculation behavior.

## Handoff

- Result: pending

## Integration

- Pending.
