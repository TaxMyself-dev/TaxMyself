# KT-093 - Sync business number to selected proprietor

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt093-worker`
- Branch: `codex/kt093-sync-business-number`
- Base commit: `0f617c90`

## Business outcome

For private accounts, selecting either spouse as the business proprietor
automatically fills the business number with that person's identity number.

## Acceptance criteria

- [x] Changing the proprietor in an existing-business form immediately updates
      `businessNumber` to the selected person's ID.
- [x] Changing the proprietor in the add-business form does the same.
- [x] Primary/spouse mappings use the refreshed account data and company
      accounts retain their existing behavior.
- [ ] Focused frontend tests and the Angular production build pass.
- [x] Settings topic documentation describes the synchronization rule.

## Scope and constraints

- In scope: Settings form synchronization, focused tests, and documentation.
- Out of scope: database/schema changes, production data, backend ownership
  validation, issued-document business-number policy, and reports.
- Approval boundary: Elazar explicitly requested automatic business-number
  replacement when changing the selected proprietor.

## Handoff

- Result: proprietor selection now writes the matching primary/spouse identity
  number into the business form; new private-business forms default to the
  primary identity.
- Commit hash(es): pending worker commit.
- Changed files: Settings helper/spec, page component/template, topic docs, and
  this task file.
- Tests and exact results: deferred to manager integration because this clean
  worktree has no local npm executable or dependencies.
- Risks and manual checks: existing business numbers are changed only after an
  explicit proprietor selection; company behavior is unchanged.
- Documentation updated: `frontend/src/app/pages/settings/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
