# Smoke cleanup lock wait

- Branch: codex/smoke-lock-wait
- Base: c46490a71dca24ca07250b1ae9233047b72b4a41
- Acceptance: cleanup waits for busy provisioning, deletes only after acquiring
  the same per-UID lock, releases it on success/failure, and fails closed after
  bounded waiting or on SQL errors. HTTP provisioning timing is unchanged.
- Change: four existing 30-second GET_LOCK attempts (up to 120 seconds) in the
  cleanup adapter only, with structured busy logs. Identity is still rechecked
  under the lock. Rollback cleanup remains the final fallback.
- Status: READY_FOR_MAIN_APPROVAL; feature worktree retained pending approval.
- Verification (offline): `npm.cmd test -- --runInBand smoke-drive-lock.spec.ts
  smoke-user-cleanup.spec.ts smoke-drive-cleanup.spec.ts users.drive-provisioning.spec.ts`
  passed 4 suites / 35 tests in 44.015 seconds before two additional test cases.
  Final `npm.cmd test -- --runInBand smoke-drive-lock.spec.ts` passed all 9 lock
  tests in 11.363 seconds. Other inputs unchanged; 37 distinct passing tests.
  `npm.cmd run build` passed; `git diff --check` passed.
- Selected backend service tier: focused cleanup/provisioning tests and Nest
  build. Full repository suite skipped because no shared HTTP behavior changed.
- Production/MySQL contention was not executed; timeout/release/error paths
  are simulated through the same helper used by the MySQL cleanup adapter.
- Impact: no schema, accounting, credentials or external API contract changes.
  Production cleanup may wait up to 90 additional seconds under contention.
- No production execution, main integration or GitHub push performed.
