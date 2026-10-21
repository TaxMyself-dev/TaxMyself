# KT-084 - Shani demo credentials

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt084\taxmyself-dev`
- Branch: `codex/kt084-shani-demo-credentials`
- Base commit: `56ef0730`

## Business outcome

The partner-candidate demo uses the shorter login credentials supplied by
Elazar.

## Acceptance criteria

- [x] Change the `partner-candidate-couple` email to
      `shani-demo@keepintax.co.il`.
- [x] Change its password to `Shani-demo2026`.
- [x] Add focused regression assertions for both exact values.
- [x] Do not change roles, permissions, synthetic banking data, schema, or
      external-service behavior.
- [x] Focused Jest checks and the Nest backend build pass.

## Scope and constraints

- In scope: the partner-candidate fixture, its focused test, and delivery
  documentation.
- Out of scope: Firebase/DB mutations, production data, schema, authorization,
  external providers, and deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`, and
  `backend/src/demo-data/AGENTS.md`.
- Assumption: the profile has not yet been seeded. If an old-credential account
  was created meanwhile, changing this fixture alone does not rename or remove
  that Firebase identity.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: partner-candidate profile, its focused spec, and this task
  record.
- Tests and exact results: focused Jest profile suite passed (1 suite / 5
  tests); Nest backend build passed.
- Known pre-existing failures: none. `npm ci` reported the repository's existing
  dependency audit findings (96 total) without changing the lockfile.
- Schema / production / security / accounting / external impact: none. No live
  Firebase/DB user or provider was accessed.
- Documentation updated: task record only; demo-data behavior and invariants
  did not change, so the topic `AGENTS.md` remains accurate.

## Integration

- Pending.
