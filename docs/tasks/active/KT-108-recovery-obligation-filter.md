# KT-108 - Isolate recurring debt recovery obligations

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex primary agent in isolated worktree
- Worktree: `C:\Users\harel\.codex\worktrees\kt108\taxmyself-dev`
- Branch: `codex/kt-108-recovery-obligation-filter`
- Base commit: `0b0a4e41d48917d118c844b1b9a6035555edd9f2`

## Business outcome

A customer settling overdue recurring subscription debt can proceed even when
the account retains an unrelated historical checkout or one-off obligation.

## Acceptance criteria

- [x] Recovery preview and atomic reservation select the same set of open
  `RECURRING_PERIOD` obligations.
- [x] An unrelated open `CHECKOUT` or `MANUAL_ONE_OFF` obligation cannot alter
  the reviewed recovery quote or be attached to the recovery attempt.
- [x] The stale-quote and ownership protections remain unchanged.
- [x] Focused backend tests and the Nest production build pass.

## Scope and constraints

- In scope: recovery-collection obligation query, regression coverage and
  billing topic documentation.
- Out of scope: deleting or rewriting historical billing records, changing
  prices/VAT/accounting, production data changes, CardCom calls or deployment.
- Required reading: root and backend billing `AGENTS.md` files;
  `docs/coordination/WORKFLOW.md`, `AUTHORITY.md`, `QUALITY_GATES.md`, and
  `PRODUCTION_POLICY.md`.
- Approval boundaries: the owner approved isolating recurring recovery debt
  after production evidence showed an open legacy checkout blocking a valid
  recurring debt settlement. No schema or external API change is authorized.

## Handoff

- Result: Complete. Atomic recurring-debt reservation now filters by the same
  obligation kind as preview, preserving unrelated historical obligations.
- Commit hash(es):
- Changed files: billing attempt orchestration service/spec, billing topic
  `AGENTS.md`, and this task record.
- Tests and exact results: focused Jest service suite passed, 1 suite / 56 tests;
  `npm run build` completed successfully.
- Known pre-existing failures: none in executed gates. `npm ci` reported the
  repository's existing dependency audit findings (105 total).
- Schema / production / security / accounting / external impact: no schema,
  provider API, price, VAT, accounting or authorization change. The code change
  does not mutate historical checkout/one-off records; it excludes them from
  recurring-debt collection only. No production access or deployment performed.
- Risks and manual checks: after deployment, a PAST_DUE owner with an unrelated
  legacy checkout should open CardCom for only the reviewed recurring balance.
- Documentation updated: backend billing invariant and this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
