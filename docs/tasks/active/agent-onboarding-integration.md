# Agent onboarding integration candidate

Status: IN_PROGRESS

## Authorization and acceptance

User explicitly requested a separate integration branch, conflict resolution and
checks on the combination with main. No merge into main, push, schema/data mutation,
deployment or application-server startup is authorized. Do not update other worktrees.

- Main base: 3f387f2191b870f8fab521a906e922d78854867b (local main, verified clean).
- Feature input: 072ee194 (codex/agent-onboarding), including its main-agent ancestry.
- Branch: codex/agent-onboarding-integration.
- Worktree: C:/Users/user/Keepintax/TaxMyself-agent-onboarding-integration.
- Feature worktree's untracked backend/journey-timings.local remains untouched.
- No remote refresh is claimed: this candidate targets the user's current local main.

Acceptance: preserve both parents' functionality; resolve all textual/semantic
conflicts; lockfiles support clean independent npm ci; shared-agent type/lint/tests
and build pass; focused Nest integration/security/report reads and Nest build pass;
focused Angular onboarding/admin/shared chat plus affected main features and production
build pass; inspect auto-merged reporting paths; document exact results and limitations.

## Merge resolution

The single textual conflict was frontend/package.json scripts.start. Kept the
feature's node scripts/start-local.js wrapper. Without ignored worktree overrides it
retains main's 4200/3000 defaults; with overrides it supports independent feature
ports. All dependency additions/lockfile updates from both parents are retained.
Auto-merged backend package files and report-review.service.ts require review/checks.

Local environment files were copied from primary main (backend/.env only existed).
Only missing AI settings were supplemented from the existing feature's ignored env;
primary DB configuration was preserved. Candidate origins include local 4205.
Ignored candidate ports: frontend 4205, backend 3005, onboarding enabled.
No secrets/env/dependencies/build output or test artifacts are tracked.

## Verification plan

1. Clean independent npm ci in backend, frontend and backend/agent.
2. Inspect both-parent auto-merges and the reporting read-only boundary.
3. Agent required checks; focused combined Nest/Angular checks and all three builds.
4. Verify main and feature refs/working trees remain unchanged; local candidate commits only.

Results and final candidate revision will be recorded below.
