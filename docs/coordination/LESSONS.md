# Process lessons and prevention rules

These rules come from failures observed while integrating the first parallel
Keepintax tasks on 2026-09-04.

## 1. Workers started from an older integration base

`main` advanced from `2e94b7e6` to `ff206d60` while three workers were based on
the older integration commit. Their changes were valid, but integration first
had to fast-forward to new `main` and replay each worker commit.

Prevention: synchronize and record the exact base before dispatch. At
integration, always compare current `main` with the recorded base and preserve
newer main commits before applying worker work.

## 2. Every worker appended to the same redesign worklog

Parallel commits all appended at the end of `docs/redesign/worklog.md`, causing
predictable cherry-pick conflicts even though code files were independent.

Prevention: workers do not edit shared append-only logs. They return a handoff;
the manager writes one integration entry and updates `TASKS.md`. If a worker is
explicitly assigned a redesign plan item, the manager must reserve the shared
file to that worker or serialize integration.

## 3. A package manager was run through another worktree's node_modules

A temporary junction pointed the integration worktree at the user's frontend
`node_modules`. Running pnpm in an npm-managed package moved npm-installed
dependencies into `.ignored`. The command was stopped, npm restored the
dependencies, `.ignored` was removed, and `package-lock.json` was restored; the
main checkout was clean afterward.

Prevention: never share or junction dependency directories. Never infer the
package manager from tool availability; use the lockfile. Install only inside
the active worktree. The user's main dependency tree is read-only during
manager verification.

## 4. Broad Angular tests compile unrelated legacy specs

An `ng test --include` run still compiled old unrelated specs and third-party
declarations, producing known failures even though the requested specs and
Angular application build were valid.

Prevention: workers record focused test execution precisely. The manager
reproduces suspected pre-existing failures on the base when needed, requires a
successful Angular build, and never reports the broad suite as green. Legacy
test debt is tracked separately rather than fixed opportunistically inside an
unrelated feature.

## 5. Builds are slow and silence can look like a hang

Combined Nest/Jest/Angular verification ran for several minutes with long gaps
in output. Killing valid jobs early would waste time and hide the performance
problem being investigated.

Prevention: run independent checks in parallel only when machine capacity
allows, retain process/session IDs, poll without restarting, and provide a short
manager update at least once per minute. Use the backend performance report to
optimize the underlying startup/build path separately.

## 6. A worker commit is not delivery

Three correct commits existed in detached worker worktrees but were absent from
both integration and main until the manager explicitly reviewed and
cherry-picked them.

Prevention: `WORKER_COMPLETE` and `PUSHED` are different states. Completion is
reported to Elazar only after remote ref verification, unless the status report
explicitly says the task is waiting for integration.
