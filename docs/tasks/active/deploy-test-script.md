# Test deployment script

- Status: `WORKER_COMPLETE`
- Worktree: dedicated deploy-test feature checkout
- Branch: `codex/deploy-test`
- Base commit: `0b0a4e41d48917d118c844b1b9a6035555edd9f2`

## Acceptance criteria

- A separate deploy-test command supports Full, Backend and Frontend.
- Existing DEV Cloud Run and Firebase targets are explicit and fixed.
- Builds use existing package scripts and frontend cloud DEV configuration.
- Help and Plan are side-effect free; failures stop with a named stage.
- Deploy only from clean test exactly matching freshly fetched origin/test;
  local env files never uploaded.
- Focused offline tests and operator documentation included.

## Scope and constraints

No actual deployment, production changes, schema/accounting changes, local main
integration or push. Existing primary checkout changes remain untouched.

## Handoff

- Result: complete; pending explicit local main integration approval.
- Changed files: scripts/deploy-test.ps1, scripts/deploy-test.cmd,
  scripts/tests/deploy-test.Tests.ps1, scripts/AGENTS.md,
  docs/operations/test-deployment.md, this task record.
- `pwsh -NoProfile -File scripts/tests/deploy-test.Tests.ps1`: PASS, 37 checks.
- `pwsh -NoProfile -File scripts/tests/deploy.Tests.ps1`: PASS (includes cache tests).
- `pwsh -NoProfile -File scripts/tests/deploy-build-cache.Tests.ps1`: PASS.
- `cmd /c scripts\deploy-test.cmd frontend -Plan`: PASS; four DEV frontend steps.
- `cmd /c scripts\deploy-test.cmd -Help`: PASS; no deployment.
- `git diff --check`: PASS.
- Initial new-test diagnostic incorrectly expected 10 full-plan stages; corrected
  the test expectation to the actual 9. No script failure remained.
- Known pre-existing failures: none observed in these checks.
- Application builds/Jest/browser checks not executed locally: application code
  unchanged; only offline script tests were required. No cloud commands executed
  against real services. Actual DEV deployment remains a manual operator check.
- Local backend/.env copied and verified ignored. The landing env file is already
  tracked and identical to the primary checkout; it was not overwritten.
- Primary checkout had an existing untracked attachment directory, left intact.
  Work was isolated on refreshed origin/main 0b0a4e41; local main was not updated.
- Schema/accounting/production impact: none. The new operator command writes only
  DEV targets when explicitly run, using existing runtime secrets/authentication.
- Risks: shared test environment replaced; partial cloud success is not rolled
  back automatically. Fixed cloud identifiers follow existing repository docs;
  actual cloud access/resources were not inspected.
- Documentation: scripts/AGENTS.md and docs/operations/test-deployment.md.

## Dedicated test branch follow-up

- User requested test as the test environment source branch, with the same
  clean/exact-remote deployment gate as production main.
- Local test branch to be created at the completed feature commit. No remote
  test branch existed at inspection (`git ls-remote --heads origin test`).
- Added fresh exact-branch fetch and commit equality initially and before each
  cloud write. Missing branch/network/auth errors block deployment.
- Focused verification: `pwsh -NoProfile -File scripts/tests/deploy-test.Tests.ps1`
  passed 52 checks, including incorrect branch, remote mismatch, fetch failure
  and remote advancement during builds. Earlier 37-check evidence describes
  the previous implementation, superseded by this run for the test script.
- Remote branch creation/push remains unexecuted under the user's push gate;
  manual testing of current main and explicit push approval are required.
