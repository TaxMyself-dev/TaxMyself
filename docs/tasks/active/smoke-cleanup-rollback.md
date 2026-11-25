# Smoke cleanup and rollback recovery

- Branch: codex/smoke-cleanup-rollback
- Base: 64838cf4af31ec75509346d95b7c70aad7efec62
- Status: READY_FOR_MAIN_APPROVAL
- Problem: concurrent signup/login provisioning can create duplicate exact-name
  smoke folders. Cleanup then fails, leaving the fixed synthetic identity after
  the release rolls back.
- Changes: shared per-user provisioning/cleanup lock, fresh identity checks,
  bounded exact-run duplicate cleanup, non-secret recovery state, cleanup retry
  after both rollback attempts with original error preserved.
- Boundaries: no production writes, manual deletion, cloud execution, schema
  migration, main integration or push is authorized by this implementation task.
- Verification: focused backend 4 suites / 30 tests passed; smoke runner 17 unit
  tests passed; rollback-handler replay tests passed. Full backend suite/build
  passed 324 suites / 3349 tests, with 3 suites / 27 tests skipped (unchanged baseline). Windows PowerShell deployment tests and PowerShell 7 rollback replay passed. Production build passed.
- Manual acceptance after separately approved integration/push: deploy the
  tested revision, verify one folder for a synthetic signup, and confirm cleanup
  on normal and failed smoke. Do not bypass identity protections to clear a
  leftover account. Existing failed run vdlqrfjatpctaxty has not been cleaned
  as part of this task.
- Main integration requires explicit approval. After integration and checks,
  remove the completed worktree safely, preserving unique ignored files first.
  GitHub push requires the owner's manual main test and separate approval.

## Verification commands

- `npm.cmd test -- --runInBand users.service.spec.ts users.drive-provisioning.spec.ts smoke-user-cleanup.spec.ts smoke-drive-cleanup.spec.ts`: 4 suites, 30 tests passed.
- `npm.cmd test -- --runInBand --json --outputFile=../deployment-logs/smoke-cleanup-jest.json`: 324 passed suites, 3349 passed tests, 3 skipped suites / 27 skipped tests, 396.608 seconds. No failing tests.
- `npm.cmd test` in smoke-tests: 17 passed unit tests; all child/browser/cloud commands mocked.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/deploy.Tests.ps1`: passed, including build reuse and actual rollback-handler replay under restore/cleanup failure.
- PowerShell 7 `-NoProfile -File scripts/tests/rollback-smoke-cleanup.Tests.ps1`: passed.
- `npm.cmd run build`: passed.
- No full live signup, Firebase/Drive write, private job execution or MySQL lock rehearsal was run in production.