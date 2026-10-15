# PDF service isolation

- Status: `IMPLEMENTED_PENDING_CLOUD_VERIFICATION`
- Task manager: Codex, current chat (no delegated workers)
- Worktree: `C:/Users/user/Keepintax/TaxMyself-pdf-service`
- Branch: `codex/pdf-service`
- Base commit: `0901239796bea250dbd7857afa18dc0837d0eff5` (verified origin/main)

## Business outcome and acceptance criteria

- Render previews and issuance PDFs in a private standalone Node 22 service using the browser image proven in the diagnostic builds.
- Keep the backend Dockerfile, Node 18, accounting, signing, persistence, frontend and database schema unchanged.
- Preserve the approved template and fonts with one source of truth.
- Use authenticated synchronous HTTP now; define a versioned, serializable render job that can later be carried by a queue.
- No automatic retry of issuance/signing; no unsigned fallback on remote errors.
- Bound browser lifetime, input/output size and per-instance work; redact payloads and credentials from logs.
- Test remote routing, authentication/error handling, validation, browser cleanup and the HTTP boundary. Build Nest.
- Prepare reproducible image verification and operator deployment instructions. Do not access or deploy production.

## Constraints

Existing PDF worktree contains an unrelated uncommitted diagnostic draft; leave it intact. Main is clean and stays on main. Do not touch new-ai-chat or codex/integration. Copy ignored local environment files at worktree creation. No production access per `docs/coordination/PRODUCTION_POLICY.md`.

## Handoff

- Implementation complete on this feature branch; no integration/push/deployment.
- Backend focused Jest: 6 suites, 53 tests passed (remote client/routing,
  local renderer regression, template, signing and identity images).
- Nest build: passed. Host Node 24 with an untracked Windows realpath fallback;
  a sandbox transform-cache error was resolved by placing the cache in the
  authorized Documents scratch directory. No application workaround committed.
- Standalone service tests: 9 passed on downloaded official Node 22.18.0
  (archive SHA256 checked against the official distribution checksum).
- Template TypeScript compilation: passed.
- Real local HTTP/browser smoke on Node 22.18.0 and installed Windows Chrome
  155: all three synthetic documents passed; 3.9s/4.2s/4.4s in the recorded run.
  Logo receipt and all four invoice pages rasterized/visually inspected.
  This is not a Linux/container or IAM/end-to-end signing validation.
- Backend Dockerfile, backend dependency manifests/lock, frontend, accounting
  logic, DB schema/data unchanged. The two backend/client source integrations
  preserve existing signing/persistence flow. Local env copied and ignored.
- New internal HTTP boundary uses Cloud Run IAM service identity; no shared
  token, DB access or FILLFASTER token in renderer. No production access used.
- Reproducible cloud image verification/publish configs and manual setup in
  `pdf-service/README.md`. Linux image build, service IAM, development end-to-end
  issuance and production deployment remain operator checks, not claimed passed.
- Queue preparation is a versioned pure render job only; no durable queue,
  retry store, result status API or async frontend is implemented.
- Existing uncommitted PDF diagnostics draft, other worktrees and main untouched.
