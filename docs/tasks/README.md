# Task records

Active task state remains in the repository for now. To avoid merge conflicts,
each active task has its own file under `active/`; managers do not share one
mutable dashboard.

## Rules

- Create active tasks from `TEMPLATE.md`.
- The assigned task manager is the only routine editor of that task file.
- Workers report through the handoff format and do not edit task records.
- After the primary integration manager verifies the commit on `origin/main`,
  move the durable summary to the annual archive and remove the active file.
- Keep transient command output and chat transcripts out of the repository.

## Status vocabulary

`APPROVED` -> `DISPATCHED` -> `IN_PROGRESS` -> `WORKER_COMPLETE` ->
`MANAGER_REVIEW` -> `INTEGRATED` -> `VERIFIED` -> `PUSHED` -> `CLOSED`.

`BLOCKED` may replace an active state and must state the required decision or
external condition.
