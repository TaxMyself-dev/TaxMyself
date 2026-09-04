# Keepintax task dashboard

Last updated: 2026-09-04. This file is maintained by the manager chat.

## Status vocabulary

`APPROVED` → `DISPATCHED` → `IN_PROGRESS` → `WORKER_COMPLETE` →
`MANAGER_REVIEW` → `INTEGRATED` → `VERIFIED` → `PUSHED` → `CLOSED`.

`BLOCKED` may replace any active state and must name the required decision or
external condition.

## Current tasks

| ID | Task | Worker worktree | State | Result / commit | Verification |
|---|---|---|---|---|---|
| KT-001 | Admin access to expired client accounts | `.codex/worktrees/14cc/taxmyself-dev` | `CLOSED` | `dc2fda37` on `origin/main` | 60-test combined backend run included billing/auth guards; Nest and Angular builds passed |
| KT-002 | Issued documents ordered by `docDate DESC, id DESC` | `.codex/worktrees/8c93/taxmyself-dev` | `CLOSED` | `bae142fb` on `origin/main` | Focused query test passed in combined backend run; Nest build passed |
| KT-003 | VAT report eligibility and business selection | `.codex/worktrees/7596/taxmyself-dev` | `CLOSED` | `28320a01` on `origin/main` | Worker focused Angular tests passed; combined Angular build passed; broad Karma compilation has documented pre-existing failures |
| KT-004 | Investigate slow backend startup and propose solutions | `.codex/worktrees/e40f/taxmyself-dev` | `IN_PROGRESS` | Research only; no commit expected | Waiting for worker handoff/report |

## Delivery baseline

After KT-001 through KT-003, local `main`, `origin/main`, and
`codex/integration` were verified at `28320a01`. Pushing code is not production
deployment; production actions remain separately approved.
