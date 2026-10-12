# Cloud parallel experiment 1

- Experiment number: 1 of exactly two concurrent Cloud experiments.
- Notion subtask ID: 3f60009b-01f6-81fd-a9ce-e781f54d1045
- Parent Notion ID: 3f60009b-01f6-81ef-b44e-c3d251bc5ea0
- Base SHA: ec1a52a79976cb7280a760c9d373164c0221256e
- Branch: codex/cloud-parallel-1-3f60009b
- Purpose: verify concurrent Cloud task lifetimes and independent workspaces using one isolated documentation artifact per experiment.
- Constraints: create only this file; leave it untracked and uncommitted. No staging, commits, pushes, merges, deployments, npm, installs, builds, test suites, databases, services, secrets, other agents, new tasks, or Notion writes. Allow at most one ordinary fetch of origin main, with no escalation, alternate transport, retries, or overwrite.
- Observation: after creation, retain a bounded 60-second lightweight observation interval, then reread this file and Git status and verify the peer experiment file is absent. This interval is observation, not productive work or evidence of simultaneous mutations.

## Delivery authorization

The earlier no-commit constraints applied to the parallel experiment. On 2026-10-12 at 10:42 UTC, the owner authorized this Delivery experiment through a draft pull request, including a one-off exception for this Cloud worker to push the experiment branch on the manager's behalf. Merge and deployment remain outside this authorization.
