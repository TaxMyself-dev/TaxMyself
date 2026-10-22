# KT-093 - Sync business number to selected proprietor

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: pending
- Branch: `codex/kt093-sync-business-number`
- Base commit: `0f617c90`

## Business outcome

For private accounts, selecting either spouse as the business proprietor
automatically fills the business number with that person's identity number.

## Acceptance criteria

- [ ] Changing the proprietor in an existing-business form immediately updates
      `businessNumber` to the selected person's ID.
- [ ] Changing the proprietor in the add-business form does the same.
- [ ] Primary/spouse mappings use the refreshed account data and company
      accounts retain their existing behavior.
- [ ] Focused frontend tests and the Angular production build pass.
- [ ] Settings topic documentation describes the synchronization rule.

## Scope and constraints

- In scope: Settings form synchronization, focused tests, and documentation.
- Out of scope: database/schema changes, production data, backend ownership
  validation, issued-document business-number policy, and reports.
- Approval boundary: Elazar explicitly requested automatic business-number
  replacement when changing the selected proprietor.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
