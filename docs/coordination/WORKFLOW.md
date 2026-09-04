# Keepintax parallel delivery workflow

This is the binding runbook for the main manager chat and every delegated worker
chat. `main` is the version Elazar runs. `codex/integration` is the manager's
staging branch. Workers operate in isolated Codex worktrees, normally at
`C:\Users\harel\.codex\worktrees\<id>\taxmyself-dev`.

## Roles

### Manager

The manager owns requirements, task tracking, delegation, review, integration,
combined testing, documentation, pushing, cleanup, and user status reports. It
is the only role allowed to merge, push, update the user's `main` checkout, or
resolve cross-task conflicts.

### Worker

A worker owns exactly one task and one worktree. It may investigate, edit, test,
document task-local behavior, and create local commits. It must not push, merge,
rebase shared branches, deploy, modify another worktree, or broaden the approved
business behavior.

## Phase A — intake and dispatch

1. Write acceptance criteria before opening a worker. Record the task in
   `TASKS.md` with status `APPROVED`.
2. Identify affected modules, shared files, database/external-service risk, and
   whether the redesign master plan must be read.
3. Confirm both the manager worktree and the user's `main` checkout are clean.
   A dirty checkout is a blocker; never overwrite or hide user changes.
4. Refresh remote state when network access is available. Make
   `codex/integration` contain current `main` before dispatch. Record the exact
   base commit in `TASKS.md`.
5. Create a fresh Codex worktree from that exact integration base. Never assign
   a new task to a worktree containing changes or an unfinished prior task.
6. The worker prompt must include scope, acceptance criteria, required tests,
   documentation, forbidden actions, and this mandatory final handoff format:

```text
Result: complete | blocked
Base commit:
Commit hash(es):
Changed files:
Tests run and exact results:
Known pre-existing failures:
Risks / manual checks:
Documentation updated:
```

## Phase B — worker execution

1. Read root and nearest topic `AGENTS.md` files before editing. Read the full
   redesign master plan before touching categories, booking accounts, journal
   entries, or reports.
2. Verify the worktree is clean and still based on the recorded commit.
3. Investigate first. If reality conflicts with an approved decision or the
   requested behavior is ambiguous, stop and report the exact question.
4. Change only files required for the acceptance criteria. Preserve unrelated
   user changes and avoid opportunistic refactors.
5. Use the repository package manager indicated by its lockfile. This repository
   uses npm where `package-lock.json` exists. Never run pnpm in that package.
6. Dependencies belong to the current worktree. Never point `node_modules` at
   another worktree with a junction, symlink, shared path, or package-manager
   conversion. If dependencies are missing, use `npm ci` in the current
   worktree; do not install into the user's `main` checkout.
7. Run focused tests covering the changed behavior, then the relevant build.
   Record commands, counts, exit codes, and warnings. Do not describe a test as
   passed if it did not execute.
8. Distinguish failures:
   - changed-code failure: fix it; this blocks completion;
   - pre-existing failure: reproduce on the recorded base and document it;
   - environment/tool failure: repair the isolated environment and rerun.
9. Update nearest topic documentation. Do not append to shared
   `docs/redesign/worklog.md`, `TASKS.md`, or another worker's files unless the
   manager explicitly assigned them.
10. Commit locally and send the handoff. The commit must contain no dependency
    directories, build output, caches, secrets, `.env` files, or temporary data.

## Phase C — manager review and integration

1. Mark the task `WORKER_COMPLETE`; capture worktree path and commit hashes.
2. Inspect the full diff, `git show --check`, security boundaries, business
   behavior, tests, documentation, and unintended files. A worker's green report
   is evidence, not a substitute for manager review.
3. Before integration, bring `codex/integration` forward to current `main` with
   fast-forward when possible. If `main` advanced after dispatch, apply the
   worker commit onto the new base; never discard the newer main commits.
4. Integrate one task commit at a time. After each commit, verify status and
   inspect the resulting diff. Resolve additive documentation conflicts by
   preserving both entries. A code conflict requires renewed semantic review.
5. Add the shared `docs/redesign/worklog.md` entry when required and update
   `TASKS.md`. The manager owns these shared append-only edits.
6. Run combined verification on the integrated tree:
   - focused backend tests for changed modules;
   - Nest build for backend changes;
   - focused frontend tests where the repository runner can isolate them;
   - Angular build for frontend changes;
   - extra regression or baseline checks required by topic instructions.
7. A repository-wide legacy test failure is not silently ignored. It may be
   classified as pre-existing only after comparison with the base; record the
   exact failure and require the changed modules' focused checks plus build to
   pass.

## Phase D — automatic main delivery

When every gate passes and the action is within `AUTHORITY.md`:

1. Confirm `codex/integration` and the user's `main` checkout are clean.
2. Require current `main` to be an ancestor of `codex/integration`.
3. Fast-forward the local `main` checkout. Do not create an avoidable merge
   commit and never force-push.
4. Push `codex/integration` and `main`.
5. Verify local `main`, `origin/main`, and `codex/integration` resolve to the
   intended commit.
6. Mark the task `PUSHED`, report what Elazar can run, and state clearly that a
   Git push is not a production deployment.
7. Only after the commit is reachable from `origin/main`, archive the worker and
   remove its clean worktree. Never recursively delete an unresolved path.

## Stop conditions

Stop automatic integration and notify Elazar when tests fail because of changed
code, a code conflict changes meaning, scope expands, `main` is dirty, a schema
or production-data action is needed, a tax/accounting/security decision was not
approved, a force push would be required, or the correct target commit cannot be
proved.
