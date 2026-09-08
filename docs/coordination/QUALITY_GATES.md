# Quality gates

No change reaches `main` until the primary integration manager records evidence
for every applicable gate below. A worker report is evidence to review, not a
replacement for manager verification.

## Every task

- Acceptance criteria are explicit and unchanged, or scope expansion was approved.
- The complete diff and `git show --check` were reviewed.
- No secrets, `.env` files, dependencies, build output, caches, or temporary
  evidence are committed.
- Focused tests cover the changed behavior and actually executed successfully.
- Documentation matches the resulting behavior.
- Schema, production, security, accounting, and external-contract impact is
  stated explicitly, including `none` when applicable.

## Backend changes

- Run focused Jest tests for changed services/controllers.
- Run the Nest build.
- For database behavior, verify transaction boundaries, tenant/business scope,
  authorization, and failure atomicity.

## Frontend changes

- Run focused tests when the runner can isolate them reliably.
- Run the Angular production build.
- Record broad-suite legacy failures accurately; never report an unexecuted or
  compilation-blocked test as passed.

## Documentation-only changes

- Run the repository Markdown-link check and `git diff --check`.
- Verify instruction discovery: one root `AGENTS.md`, correctly named nearest
  topic files, and no conflicting root instruction file.
- Application tests/builds are not required when no executable or configuration
  file changed; record that determination instead of claiming they passed.

## Integration

- Integrate one task at a time on current `origin/main`.
- Re-run affected focused checks on the integrated tree.
- A conflict in code meaning requires renewed semantic review.
- A suspected pre-existing failure must be reproduced on the recorded base.
- Verify the intended commit on local `main`, `origin/main`, and
  `codex/integration` after push.
