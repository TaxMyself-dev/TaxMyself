# KT-126 - Cloud Build Dockerfile compatibility

- Status: `PUSHED`
- Task manager: Codex primary integration manager
- Worker: Codex primary agent
- Worktree: `C:\Users\harel\.codex\worktrees\kt126\taxmyself-dev`
- Branch: `codex/kt-126-cloud-build-dockerfile`
- Base commit: `23a13c1f2eb414af6a057856497cfa56a740b9da`

## Business outcome

The guarded release can parse and build the backend Dockerfile through Cloud Run source deployment instead of failing at Stage 8 before the first Docker instruction executes.

## Evidence and scope

- Operator-provided Cloud Build error: `dockerfile parse error line 103: Unknown flag: network`.
- Root cause: `RUN --network=none` requires BuildKit Dockerfile support, while the source-deploy Cloud Builder used the legacy parser.
- In scope: portable final-image probe instruction, regression assertion and accurate packaging documentation.
- Out of scope: application behavior, dependencies, schema/data, production access, deployment execution and unrelated release diagnostics.

## Acceptance criteria

- [x] Dockerfile retains the final agent image contract probe without BuildKit-only `RUN` flags.
- [x] Focused image-probe tests pass and prevent reintroducing `RUN --network`.
- [x] Backend production build passes.
- [x] No application, dependency, schema, environment or production-data change.

## Handoff

- Result: Replaced the BuildKit-only final probe instruction with legacy-Docker-compatible `RUN node scripts/check-agent-image.cjs`; the image contract probe remains mandatory.
- Commit hash(es): Source and integration `443eb431` (direct descendant of current main).
- Changed files: `backend/Dockerfile`; `backend/scripts/check-agent-image.test.cjs`; `docs/operations/agent-image-packaging.md`; this task file.
- Tests and exact results: `node --test scripts/check-agent-image.test.cjs` passed 5/5; backend `npm ci` with npm 11.6.2 passed (1,177 packages); backend `npm run build` passed; `git diff --check` passed.
- Risks and manual checks: Docker is unavailable locally, so the Cloud Build parser is not executed locally. The operator must rerun the guarded release; Stage 8 must parse the Dockerfile and the retained image probe must pass before any candidate can become ready. No traffic was changed by the failed build.
- Documentation updated: Packaging guide now distinguishes the portable build-time probe from the separate operator `docker run --network none` verification.

## Integration

- Reviewed by: Codex primary integration manager; full diff, parser evidence, safety boundary and unintended-file review passed.
- Integrated commit: `443eb431` on `codex/integration-kt126`, based directly on current `origin/main` `23a13c1f`.
- Combined verification: Exact source commit passed 5/5 focused image-probe tests on both worker and integration branches, npm 11.6.2 clean install (1,177 packages), backend production build and `git diff --check`. Required main port check reported frontend 4200, backend 3000 and API `http://localhost:3000/`, with no process or local override.
- `origin/main` verification: Source delivery verified at `d65bf3cc6bc0c711f40b96f8ddcbe5384c1ef280` on local `main`, tracking `origin/main`, remote `main` and remote `codex/integration-kt126`.
- User-visible run instructions: After delivery, rerun `.\scripts\deploy`. Stage 8 must parse/build the portable Dockerfile and keep the candidate at zero traffic until later guarded checks pass.
