# Agent image packaging

- Status: `LOCAL_MAIN_INTEGRATED_AWAITING_MANUAL_TEST`
- Worktree: C:/Users/user/Keepintax/TaxMyself-agent-image-packaging
- Branch: codex/agent-image-packaging
- Base: 5d405a014aded6995c4c4bf987af894f275eada8 (verified local main)
- Remote observed after fetch: 82446400227ee6e5ed8751eafc2eab1656c4161c
- Initial implementation commit: 5b54c7bcda62be5ec786ec598f4e2887698e4110

Acceptance verified: independent lockfile installs/builds; same backend image/process; ESM boundary preserved; offline final-image import through Nest's shared loader asserting both consumed exports; preserved backend assets; no local secrets or dev-only dependency entries in runtime trees.

Implemented: separate agent build/runtime stages, pinned npm 11.6.2 installers, temporary build-only skip of the unsupported Alpine Effect/Oxlint prepare patch, final-stage offline probe, shared loader extraction, ignore hardening, focused tests and operator documentation. Node, runtime user, tracked manifests/lockfiles and business behavior are unchanged. No auth/model/prompt/DB/queue/scheduler changes.

Full evidence, exact commands, diagnostic failures and file list: [packaging verification](../../operations/agent-image-packaging.md).

- Backend npm ci/build passed; focused Jest: 7 suites/108 tests passed.
- Loader/probe diagnostics: 7 tests passed.
- Agent and Nest Linux builds passed; final image build exited 0.
- Final image ID: sha256:64fce90acdefa2aa0fd5b925d6bf86cbd1e5f306f399868dbaf491769e22a9e5.
- Independent container import passed without network, mounts or env, read-only, cwd=/.
- Context export audit and final-image content audit passed.
- npm cache and Temp cleaned only after explicit user approval; unavailable Temp files skipped. No existing Docker data or other user files deleted. Built-in BuildKit executor failure was worked around with a separate builder, without resetting Docker.

Local env copied without content output/overwrite and checked ignored. Main's pre-existing backend/journey-timings.local preserved. Local main integration was explicitly authorized on 2026-11-22; no push or deployment performed; no production DB or paid provider access. Existing dependency audit warnings are recorded, with no dependency upgrades in scope. Full application/DB/manual main tests remain separate from the completed offline packaging checks.

## Authorized local main integration — 2026-11-22

- User explicitly authorized local main integration, retaining separate personal-test/push approval. No push/deployment authorization is inferred.
- Both main and the packaging worktree were clean. Current main was 46673baf05cb63a981c0b57282769c08c328cb9b; origin/main after successful fetch was 82446400227ee6e5ed8751eafc2eab1656c4161c (main ahead 133, behind 0). All newer local main work was preserved.
- Merged main into the isolated packaging candidate without conflicts: 4c8ca7c01ac83cefd6f9817dbd7f46766e8a0469. No backend changes had landed on main since the packaging base. Frontend is byte-for-byte unchanged relative to current main.
- Selected quality tier: build configuration/shared backend loader. On the integrated candidate, npm run build passed; npm test -- --runInBand agent-harness passed 7 suites/108 tests in 55.473 seconds; node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs passed 7 tests. git diff --check and git show --check passed.
- Backend Git tree is 1f7bdb9969b65d223f6940ce37dc32025d1287f2 on both the tested packaging revision 94a6289c and the integrated candidate. The previously successful Linux image build/content/context evidence remains applicable; no identical image rebuild was repeated.
- Re-ran the actual image import by immutable ID: docker run --rm --network none --read-only --workdir / --entrypoint node sha256:64fce90acdefa2aa0fd5b925d6bf86cbd1e5f306f399868dbaf491769e22a9e5 /usr/src/app/scripts/check-agent-image.cjs. Exit 0, AGENT_IMAGE_LOAD_OK, both consumed exports verified. No host mounts or DB/provider activity.
- Main port gate: node frontend/scripts/start-local.js --print-config reported frontend=4200, backend=3000, apiUrl=http://localhost:3000/, source=main defaults. node backend/scripts/start-watch.js --print-config reported backend=3000. backend/.env PORT=3000, no process PORT override, no ignored worktree port config on main. Running frontend PID 15560 has ng serve -o without a port override and listens on 4200; backend PID 30364 listens on 3000. Processes were inspected only, not restarted.
- Frontend, full repository, DB and paid eval suites were not rerun: the integration diff does not change those inputs/boundaries. Earlier full Linux builds and audits are reused only because the backend tree is identical. Main is updated by fast-forward to this verified candidate plus this task-only evidence commit; no executable changes follow verification.
- No feature worktree cleanup or Docker-data deletion. Final local main must be manually tested by Elazar before any separate push approval.
