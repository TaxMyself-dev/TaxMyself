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

## 2026-10-16 follow-up: desktop preview and numeric layout

- User supplied successful operator deployment/promotion output; PDF service IAM
  probe and backend root health passed. Codex did not access production.
- Desktop preview opens a normal browser tab instead of an 800x600 popup, in
  both the document page and FilesService fallback. Mobile/PWA preview unchanged.
- Auto table sizing reserves intrinsic width for unbroken numbers/dates and
  headings; prose can wrap. Summary expands from 60mm to at least 100mm, without
  wrapping its labels or amounts. Numeric strings/accounting are unchanged.
- Added a large-amount HTTP fixture and actual Chromium layout assertions for
  grouped cents, trillion-scale values and negative values. Checks assert one
  line, no cell overflow, no summary overlap and printable-width bounds.
- Verification: Nest and Angular production builds passed (Angular reported
  bundle/style size and CommonJS warnings); 35 focused backend tests and nine
  service tests passed. Four real local HTTP PDFs rendered, three numeric layout
  cases passed, and both large-amount PDF pages were visually inspected.
  Cloud rendering/rollout of this follow-up is pending. Backend runtime,
  dependencies and database unchanged.

## 2026-10-17 development timing investigation

- User requested measurement only, no renderer behavior change and no production
  build/deploy. Development-only timings identify browser launch, page setup,
  HTML load, PDF print and browser close, including failed render cleanup.
  Backend model preparation also measures business lookup, logo download and
  render call. Logs contain durations/booleans and service request ID only.
- Six actual local HTTP renders on Node 22 / Windows Chrome: alternating three
  logo/no-logo pairs. Logo: 2162, 2073, 2243ms; no logo: 1737, 2057, 2253ms.
  Synthetic 100x100 logo embedded in the model; no storage download, DB, IAM,
  Cloud Run cold start or production CPU constraints were measured.
- Browser launch 499–812ms, page setup 97–213ms, HTML load 700–1136ms,
  PDF print 162–209ms, browser close 173–234ms. Production latency root cause
  remains unproven. Existing lifecycle, waits, timeouts and accounting unchanged.
- Follow-up AFTER latency fix: show loading status in preview tab; disable BOTH
  preview and create-document buttons while either request is in flight, restore
  after completion/error and prevent duplicate submissions. Not implemented yet.
- Verification policy requested by user: focused checks and manual development
  validation by default; full production build only for a material change.
- Verification: 21 focused backend Jest tests and 12 service tests passed; six real HTTP/browser renders passed. No production build or deploy.
