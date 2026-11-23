# KT-124 - Complete SHAAM draft issuance reliably

- Status: `WORKER_COMPLETE` — manager-reviewed; awaiting explicit main integration approval
- Task manager: Codex primary integration manager
- Worker: Codex primary agent
- Worktree: `C:\Users\harel\.codex\worktrees\kt124\taxmyself-dev`
- Branch: `codex/kt-124-shaam-draft-completion`
- Base commit: `7b63265d2a4b15b325b8e8553e4b022a09dbda23`

## Business outcome

An invoice sent through the SHAAM OAuth and allocation flow resumes reliably, appears only after official issuance, and closes its linked transaction-invoice parent when finalization succeeds.

## Acceptance criteria

- [x] Draft rows are excluded from the issued-documents list.
- [x] The successful SHAAM callback can return to document creation without a transient access-state click being ignored.
- [x] Finalizing a pending receipt or tax-invoice-receipt linked to an open transaction invoice closes that parent in the same database transaction.
- [x] Normal document issuance retains the same parent-closing behavior.
- [x] Focused frontend and backend tests cover all three regressions.
- [x] Nearest topic documentation describes the corrected lifecycle.

## Scope and constraints

- In scope: issued-document query filtering, SHAAM callback navigation, pending-allocation finalization, focused regression tests and topic docs.
- Out of scope: production data changes, schema changes, tax/accounting calculations, SHAAM external API contracts and deployment.
- Required reading: root instructions; `docs/coordination/WORKFLOW.md`; `docs/coordination/AUTHORITY.md`; `docs/coordination/QUALITY_GATES.md`; documents, SHAAM, doc-create and SHAAM-callback topic `AGENTS.md` files.
- Approval boundaries: no production access or data correction; no authorization-policy change; no accounting or schema change.

## Handoff

- Result: complete
- Commit hash(es): `3dd0151750d3b72ad8c9b9b5629f62f40900d71a`
- Changed files: documents service/test/docs; SHAAM callback page/test/docs; this task file.
- Tests and exact results:
  - Backend focused Jest: 1 suite, 4 tests passed, exit 0.
  - Frontend focused Karma/ChromeHeadless: 4 tests passed, exit 0.
  - Backend Nest build: passed, exit 0.
  - Frontend Angular production build: passed, exit 0, with pre-existing style/bundle/CommonJS warnings.
- Known pre-existing failures: `npm ci` cannot run because both package lockfiles are out of sync (`google-auth-library` missing in backend; `@types/node`/`chokidar` missing in frontend). Dependencies were installed in this worktree only with `npm install --package-lock=false`; no lockfile changed. Node engine warnings also pre-exist (runtime 22.22.2 vs backend minimum 22.22.3 and frontend declared Node 20 range).
- Schema / production / security / accounting / external impact: no schema or production-data change; no authorization-policy or external SHAAM contract change; journal amounts/posting behavior unchanged. Parent status closure remains transaction-scoped to the same business and rolls back with failed child finalization.
- Risks and manual checks: deploy and repeat an OAuth-required transaction-invoice to tax-invoice-receipt flow; verify the draft never appears in issued documents, the callback returns on the first click, and the parent closes only after successful finalization. Existing production parent 40000 is not retroactively changed by this code task.
- Documentation updated: `backend/src/documents/AGENTS.md`, `frontend/src/app/pages/shaam-callback/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager; full diff and `git show --check` passed.
- Integrated commit:
- Combined verification: focused backend/frontend tests and both production builds passed on the isolated commit. Required pre-integration local-port verification passed on main: `frontend/scripts/start-local.js --print-config` reported frontend `4200`, backend `3000`, API URL `http://localhost:3000/`, source `main defaults`; `backend/.env` sets `PORT=3000`; no process-level `PORT`, `NODE_ENV` or `DOTENV_CONFIG_PATH` override was present; no `.local-ai-dev/ports.json` override exists. Deployment-provided backend `PORT` and production API URL remain unchanged.
- `origin/main` verification:
- User-visible run instructions:
