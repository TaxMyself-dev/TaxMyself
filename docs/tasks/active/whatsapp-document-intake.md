# WhatsApp document intake development

- Status: `WORKER_COMPLETE`
- Task manager: current chat
- Worktree: TaxMyself-whatsapp
- Branch: codex/whatsapp-integration
- Base commit: 562b7855

## Business outcome

Build the first document-upload path in reviewable commits with runnable Postman checks.

## Acceptance criteria

- Explicit test-phone routing; unknown and ambiguous senders cannot import.
- Multiple businesses require selection and disallowed destinations are rejected.
- PDF/JPEG/PNG feed the existing importer with an explicit owner and business.
- Duplicate events and duplicate content do not create repeated successful imports.
- Failed uploads never return success; failed events can be retried.
- Postman collection, standalone local sandbox, focused Jest tests and Nest build.

## Scope and constraints

Development simulation first. No Meta access, schema changes, production access,
account-linking UI, customer-service bot, push, merge or deployment.
Use existing API_IMPORT source until WHATSAPP enum schema is separately approved.
In-memory event dedup is development only and resets on restart.

## Handoff

- Result: development checkpoints complete; real Drive manual test pending test-folder provisioning.
- Commit hash(es): routing checkpoint fd25af85; document checkpoint recorded in branch history.
- Changed files: backend/src/whatsapp, backend/src/app.module.ts, backend/package.json,
  backend/scripts/check-whatsapp-postman.js, docs/features/whatsapp, this task file.
- Tests: commit 1, 14 Jest checks passed and Nest build exit 0.
- Final focused checks: 5 Jest suites / 40 tests passed, including existing
  document-import cleanup tests; Nest build exit 0.
- HTTP checks: executed collection scripts and requests against the standalone
  sandbox with the local Node checker; 19 requests / 35 assertions passed.
  This was not a native Postman run. Folder 03 (real Drive) was not executed.
- Initial test selection matched unrelated paths due to the worktree name;
  stopped and replaced by exact --runTestsByPath file selection. A nonexistent
  guessed importer spec path was corrected to the actual cleanup spec path.
- Known pre-existing failures: none in the final focused checks.
- Schema / production / accounting impact: none. Existing API_IMPORT source used.
- Security: new development endpoints are token-protected, explicitly enabled,
  and unavailable in production. No existing authentication policy was changed.
- External impact: development adapter wired to existing import service; no
  live Drive or Meta requests were made by the agent.
- Read-only development database lookup found documented demo accounts, but
  none of their businesses has a provisioned Drive folder. No data was changed.
- Risks: phone mappings are operator-configured test bindings, not verified
  customer identities; event dedup is bounded process memory, not durable state.
- Documentation: runnable Postman collection and development.md describe both
  sandbox checks and the optional real development Drive check.
- Delivery: local commits only, no merge, push or deployment.
