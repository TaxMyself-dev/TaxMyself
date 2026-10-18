# KT-085 - Present a connected retry as ready

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `1f9058c9`

## Business outcome

After SHAAM connectivity is restored, an earlier retryable transfer failure no
longer looks like a current connection failure.

## Acceptance criteria

- [x] Show a connected retryable submission as ready for another attempt.
- [x] Hide the stale prior transfer error while the connection is active.
- [x] When disconnected, clearly request reconnection and describe the prior failure in Hebrew.
- [x] Preserve the persisted backend failure history and retry behavior.
- [x] Update uniform-file topic documentation and pass the Angular build.

## Scope and constraints

- In scope: uniform-file status/error presentation and topic docs.
- Out of scope: backend state, schema, OAuth behavior, live calls, deployment and push.
- Required reading: root and `frontend/src/app/pages/uniform-file/AGENTS.md`.
- Approval boundaries: no external request.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: uniform-file page TypeScript/template, topic docs and task file.
- Tests and exact results: Angular production build passed.
- Known pre-existing failures: existing style/bundle budget and CommonJS warnings remain.
- Schema / production / security / accounting / external impact: presentation-only;
  no backend state, schema, OAuth or external-service change.
- Risks and manual checks: refresh the page with a connected retryable submission
  and confirm the ready label appears without the stale error.
- Documentation updated: `frontend/src/app/pages/uniform-file/AGENTS.md` and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
