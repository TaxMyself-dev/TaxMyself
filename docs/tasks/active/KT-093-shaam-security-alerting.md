# KT-093 - SHAAM security logging and alerting foundation

- Status: `WORKER_COMPLETE`
- Task manager: primary Codex chat
- Worker: primary Codex chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: current user branch
- Base commit: `19a1ba0b`

## Business outcome

Keepintax produces safe, machine-searchable security events for authentication,
authorization and SHAAM boundary failures, and has an actionable Google Cloud
alerting checklist that routes incidents to the company contact.

## Acceptance criteria

- [x] Authentication and authorization denials produce bounded structured
      security-event logs without tokens, Firebase IDs, business numbers,
      query strings or request bodies.
- [x] Owner-only SHAAM denials, OAuth owner mismatches and upstream
      reauthorization events produce dedicated security events.
- [x] The global exception filter never logs query-string values and emits a
      generic safe event for HTTP 401/403 responses.
- [x] Focused tests cover the new security logging and URL redaction behavior.
- [x] A Google Cloud runbook defines the exact alerts, thresholds, notification
      owner, safe test procedure and remaining manual configuration.
- [x] The incident runbook names Elazar Harel as incident manager, Shmuel Harel
      as deputy, and `info@keepintax.co.il` as the company contact; the 72-hour
      reporting limit is documented as a deadline rather than a waiting period.

## Scope and constraints

- In scope: backend log events, log redaction, tests, documentation, and a
  manual Cloud Monitoring configuration checklist.
- Out of scope: changing live Google Cloud resources, production deployment,
  paid services, 2FA implementation, log retention storage, credential
  rotation, and sending a real incident notification.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/compliance/tax-authority/AGENTS.md`, `backend/src/shaam/AGENTS.md`,
  `backend/src/guards/AGENTS.md`, and S09 §§9-11 and §§20-21.
- Approval boundaries: live notification channels and alert policies require
  explicit execution in the production Google Cloud project; this task only
  prepares and verifies the application and operating instructions.

## Handoff

- Result: complete
- Commit hash(es): this commit
- Changed files: global exception filter and test; Firebase auth guard and
  test; SHAAM secure controller and test; security/compliance runbooks and
  topic documentation.
- Tests and exact results: focused Jest suites — 3 passed, 48 tests passed;
  `npm run build` — passed.
- Known pre-existing failures: none encountered in the focused scope.
- Schema / production / security / accounting / external impact: no schema,
  production, accounting or external-resource mutation. Security logging and
  redaction behavior changed; Cloud policies still require manual setup.
- Risks and manual checks: deploy to dev/staging, inspect an emitted log for
  redaction, create/verify the email channel and policies, then perform the
  documented safe 401 test. Do not test with real SHAAM state or payloads.
- Documentation updated: guards/SHAAM/compliance AGENTS, incident runbook,
  monitoring runbook, requirements matrix and roadmap.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
