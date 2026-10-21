# KT-084 - Shani demo credentials

- Status: `APPROVED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt084\taxmyself-dev`
- Branch: `codex/kt084-shani-demo-credentials`
- Base commit: `d1bd6149`

## Business outcome

The partner-candidate demo uses the shorter login credentials supplied by
Elazar.

## Acceptance criteria

- [ ] Change the `partner-candidate-couple` email to
      `shani-demo@keepintax.co.il`.
- [ ] Change its password to `Shani-demo2026`.
- [ ] Add focused regression assertions for both exact values.
- [ ] Do not change roles, permissions, synthetic banking data, schema, or
      external-service behavior.
- [ ] Focused Jest checks and the Nest backend build pass.

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

- Result: pending

## Integration

- Pending.
