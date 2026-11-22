# Agent image packaging

- Status: `COMPLETE_LOCAL_AWAITING_INTEGRATION_APPROVAL`
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

Local env copied without content output/overwrite and checked ignored. Main's pre-existing backend/journey-timings.local preserved. No main integration, push or deployment performed; no production DB or paid provider access. Existing dependency audit warnings are recorded, with no dependency upgrades in scope. Full application/DB/manual main tests remain separate from the completed offline packaging checks.
