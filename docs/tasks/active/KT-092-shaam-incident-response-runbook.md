# KT-092 - SHAAM security incident response runbook

- Status: `WORKER_COMPLETE`
- Task manager: `/root`
- Worker: `/root`
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `9b4a7af26bf9f276791b0f21a3410e7d69ea2f30`

## Business outcome

Keepintax has an actionable, evidence-preserving response procedure for a
suspected or confirmed SHAAM security incident, including the Tax Authority's
72-hour written-notification clock. The temporary decision to keep production
invoice-allocation active for the two existing relevant users is recorded
without representing the open MFA gap as compliant.

## Acceptance criteria

- [x] Define reportable triggers, severity, roles and the 72-hour clock.
- [x] Define containment actions that preserve evidence and avoid leaking secrets.
- [x] Provide an evidence checklist, recovery gate and written report template.
- [x] Record the bounded temporary production exception and review date.
- [x] Link the runbook from the Tax Authority compliance index and evidence matrix.
- [ ] Insert the official SHAAM security-reporting contact from the signed
      onboarding/contract material.
- [ ] Assign a privacy/legal reviewer and complete the first tabletop exercise.

## Scope and constraints

- In scope: documentation and operating procedure only.
- Out of scope: production changes, credential rotation, customer notification,
  external reporting, MFA-provider selection and code changes.
- Required reading: `docs/compliance/tax-authority/AGENTS.md`, source S09,
  `requirements-matrix.md`, `gaps-and-roadmap.md`.
- Approval boundaries: Elazar approved keeping invoice allocation active in
  production for the two current relevant users while MFA remains an explicit
  open risk. No additional users or broader production feature activation is
  authorized by this task.

## Handoff

- Result: complete; operational contact assignment and first exercise remain
  explicit manual follow-ups.
- Commit hash(es): pending local commit
- Changed files: incident runbook; compliance README, topic AGENTS, gap roadmap
  and requirements matrix; this task file.
- Tests and exact results: `git diff --check` passed; all five local Markdown
  link targets checked with `Test-Path` and exist. No application test or build
  is required for documentation-only changes.
- Known pre-existing failures: repository has no Markdown-link-check script;
  local targets were therefore validated directly.
- Schema / production / security / accounting / external impact: documentation
  only; no schema, production, customer-data, accounting or external-service
  mutation. Security operating procedure is tightened, while MFA remains open.
- Risks and manual checks: official Tax Authority reporting contact and
  privacy/legal reviewer remain to be assigned; first exercise remains required.
- Documentation updated: yes — the compliance index, topic map, evidence
  matrix and roadmap now link to the runbook and preserve the open MFA risk.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
