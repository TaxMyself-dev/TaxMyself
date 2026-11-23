# KT-125 - Restore deterministic release installs

- Status: `VERIFIED`
- Task manager: Codex primary integration manager
- Worker: Codex primary agent
- Worktree: `C:\Users\harel\.codex\worktrees\kt125\taxmyself-dev`
- Branch: `codex/kt-125-lockfile-release-fix`
- Base commit: `ee9a43ec4239752cd5b5eec5eda2225365d146b5`

## Business outcome

The guarded production release can complete clean dependency installation for both backend and frontend instead of stopping at Stage 4 or Stage 5 because package manifests and lockfiles disagree.

## Acceptance criteria

- [x] Backend `package-lock.json` contains the dependency graph required by `package.json`.
- [x] Existing frontend lockfile work on current main is preserved and passes `npm ci`.
- [x] `npm ci` succeeds independently in backend and frontend.
- [x] Backend and frontend production builds pass from those clean installs.
- [x] No application behavior, schema, production data or deployment configuration changes.

## Scope and constraints

- In scope: minimal lockfile synchronization, clean-install verification and production builds.
- Out of scope: dependency upgrades beyond manifest resolution, application code, deployment execution, production access and vulnerability remediation.
- Required reading: root instructions; coordination workflow/authority/quality gates; `scripts/AGENTS.md`.
- Approval boundaries: preserve the user-authored frontend lockfile commit; no `npm audit fix`, force update or production action.

## Handoff

- Result: Synchronized the backend npm lockfile with the dependency graph expected by the release runner. The previously missing nested `google-auth-library@11.3.4` resolution is now locked.
- Commit hash(es): Worker `45959790`; integration `7f783539`.
- Changed files: `backend/package-lock.json`; this task file.
- Tests and exact results: backend `npm ci --no-audit --no-fund` passed; frontend `npm ci --no-audit --no-fund` passed; backend `npm run build` passed; frontend `npm run build` passed.
- Known pre-existing failures: None. Existing npm engine/deprecation notices and Angular style/bundle/CommonJS warnings remain non-fatal. The release host currently runs Node `22.22.2`, while backend declares `>=22.22.3`.
- Schema / production / security / accounting / external impact: None. Lockfile-only dependency metadata change; no application code, schema, production data, configuration or deployment action.
- Risks and manual checks: The authorized operator must rerun `./scripts/deploy`; Codex does not execute or inspect production deployment. Confirm the guarded release advances beyond Stage 4 and Stage 5.
- Documentation updated: This task file only; no topic behavior changed.

## Integration

- Reviewed by: Codex primary integration manager; full lockfile diff and unintended-file review passed.
- Integrated commit: `7f783539` on `codex/integration-kt125`, based on current `origin/main` `ee9a43ec`.
- Combined verification: backend and frontend `npm ci --no-audit --no-fund` passed from separate clean installs; backend and frontend `npm run build` passed. Required main local-port check reported frontend 4200, backend 3000, API `http://localhost:3000/`, no process or local port override.
- `origin/main` verification: Pending delivery.
- User-visible run instructions: After source delivery, the authorized operator reruns `.\scripts\deploy`. Codex does not execute or inspect the production deployment.
