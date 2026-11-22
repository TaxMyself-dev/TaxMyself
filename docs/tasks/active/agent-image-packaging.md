# Agent image packaging

- Status: `IMPLEMENTED_VERIFICATION_BLOCKED`
- Worktree: C:/Users/user/Keepintax/TaxMyself-agent-image-packaging
- Branch: codex/agent-image-packaging
- Base: 5d405a014aded6995c4c4bf987af894f275eada8 (verified local main)
- Remote observed after fetch: 82446400227ee6e5ed8751eafc2eab1656c4161c

Acceptance: independent lockfile installs/builds, same backend image/process, ESM boundary preserved, offline final-image import through Nest's shared loader asserting both consumed exports, preserved backend assets, no secrets/dev-only dependency trees in runtime.

Implemented: separate agent build/runtime dependency stages, final-stage offline probe, minimal shared loader extraction, ignore hardening, 7 focused diagnostic tests, operator documentation. No business, auth, model, prompt, DB, queue or scheduler changes.

Evidence and exact commands: [packaging verification](../../operations/agent-image-packaging.md). Source/contract diagnostics pass; actual backend/agent builds and final Linux image import remain unverified. C: has no free space; npm ci failed ENOSPC and Docker's containerd write failed read-only. No final image was produced. Removed only the task-created incomplete backend/node_modules. Local env copied without output/overwrite and checked ignored. Main's pre-existing backend/journey-timings.local preserved.

No main integration, push or deployment authorized or performed. No production DB or paid provider access. Resume required build/image verification after storage recovery; do not treat this task as accepted solely on source tests.
