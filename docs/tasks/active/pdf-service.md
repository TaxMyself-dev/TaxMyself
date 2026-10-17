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

## 2026-10-17 Chromium reuse follow-up

- User approved development browser reuse only; retain `networkidle0`, run focused
  tests and compare before/after. No production build, deployment, push or merge.
- Both render paths cache Chromium and create/close a BrowserContext for each
  document. Preserve capacity (service 1, local backend 2), outbound blocking,
  PDF options, request contract and accounting/signing behavior. Recover on the
  next request after disconnect; bound cleanup, recycle after 100 renders, and
  close on service/module shutdown. No automatic document retry.
- Timing samples and limitations recorded in `pdf-service/README.md`: warm HTTP
  mean 1761 -> 1410ms (~20%); local renderer 1910 -> 1368ms (~28%). Six synthetic
  renders before/after per path; first excluded from warm means. Local rendering
  only, no DB/storage/IAM/signing or full UI latency claim.
- Standalone service: 18 focused tests passed. Four real HTTP regression PDFs
  passed (logo/no-logo, multipage, large amounts), plus three numeric layout
  assertions. Backend: 2 focused Jest suites, 27 tests passed.
- Existing `frontend/src/environments/environment.ts` change is untouched and
  excluded from this task. No schema, tax/accounting, credentials, external API
  or infrastructure changes. Full builds omitted per explicit user instruction.
- Manual next check: restart development backend and compare repeated previews
  through the UI; first render still incurs launch. Preview loading indicator,
  mutual button lock and discount breakdown remain separate pending work.

## 2026-10-17 local standalone integration and full-request diagnostics

- User requested dev backend -> separate local PDF service, with full document
  creation timings and no production deployment. Existing feature worktree only.
- Local-only `pdf-service/scripts/dev.cjs` starts Node 22 / Windows Chrome on
  loopback 8082 using the existing compiled template. Ignored backend environment
  points PDF_SERVICE_URL there and disables synchronize; no secret copied or
  overwritten. Existing frontend environment change remains untouched.
- Development-only AsyncLocalStorage correlates Express total, controller DTO
  transform, sequential create intervals, original/copy render and signing spans,
  transport and standalone service IDs. Optional timing-only JSONL sink avoids
  collecting sensitive existing application logs. Accounting, signing semantics,
  document numbering, storage, email and schema behavior are unchanged.
- Confirmed existing flow renders AND signs original and copy sequentially;
  no optimization of that behavior was made in this task.
- Focused Jest: three suites, 33 tests passed (diagnostics, client, PDF routing).
- Runtime probe: standalone service healthy; backend uses loopback, authorized
  keepintax-dev and synchronize disabled. Unauthenticated probe rejected 401.
  Running backend reports signingConfigured=false. Full issuance measurement
  awaits user adding the signing token locally and making the intentional dev
  test document. Token must never be sent in chat.
- Real backend client -> live loopback service smoke returned a valid unsigned PDF; matching render ID verified in service logs.
- No production build, cloud access, deployment, push or integration.

## 2026-10-17 failed full-request measurement follow-up

- User supplied signing token locally and manually attempted create + preview.
  Running backend confirmed the token was configured; token never printed.
- Create: HTTP 503 / 12,736ms. Logo 2,197ms; renderer HTTP succeeded in 2,713ms;
  signing failed in 4,622ms. No copy rendering/uploads reached. Catch path rolls
  back the transaction; no extra document was created by Codex for diagnostics.
- Preview: HTTP 504 / 23,821ms, with HTML_LOAD 20,972ms and no PDF_PRINT stage.
  Timeout root cause remains unproven; `networkidle0` remains unchanged.
- Isolated synthetic signer check (no DB/number/email): provider HTTP 401.
  Operator must correct/verify the development signing credential. Checked only
  token-format booleans: no Bearer prefix or outer whitespace. No secrets logged.
- Added development-only sanitized signing failure category/status/network-code
  diagnostics and renderer load failure request counts/types, plus separate
  failed-stage/rollback/release measurements. No signing/render policy changed.
- Focused verification: service 19 tests passed; backend signer/diagnostics two
  suites, 8 tests passed. Production build/deploy/cloud access not performed.
- Local standalone helper restarted by Codex to load counters; new stdout path
  documented in README. Await user preview retry to capture the timeout cause,
  and corrected signing configuration before another full creation attempt.

## 2026-10-17 successful full creation and intermittent preview measurement

- User corrected local signing configuration and manually created a test document.
  Request 16e12854-3c85-4700-8ef5-03ded8405d14 completed HTTP 201 / 26,060ms.
  Both signing stages succeeded; previous authentication blocker is resolved.
- Nonoverlapping breakdown from the same request: logo downloads 4,504ms;
  render HTTP calls 5,194ms; signing calls 8,154ms; original/copy uploads 3,671ms;
  remainder 4,537ms (DB/journal, preparation, middleware/response and small overhead).
  Sequential create-method total 24,944ms. Nested parent spans are not added again.
- Three user previews completed in 5,620ms (201), 26,026ms (504), 6,523ms (201).
  Timeout render ID 7206e4b8-7853-4a05-93a8-8ec05a448d24: HTML_LOAD 20,777ms,
  requests started=3, finished=3, failed=0, blocked=0, pending types=[], browser
  connected=true. Thus no tracked request was unfinished at diagnostic time;
  the exact lifecycle/network-idle timeout cause remains unproven. No PDF_PRINT.
- The third preview relaunched Chromium after timeout (1,240ms), confirming
  recovery on next request. Successful warm creation renders had launch=0ms.
- User restriction on changing networkidle0 remains in force. No render/wait,
  signing, storage or accounting behavior changed during this measurement.
  Potential next scopes: explicit font/image readiness instead of networkidle0
  (requires approval to lift restriction), and reuse branding bytes within one
  issuance to avoid downloading the same logo for original and copy.
- No production build, access or deployment; figures describe this local dev run.

## 2026-10-18 approved shared preparation / overlap / explicit readiness

- User approved shared original/copy preparation, render/sign overlap, parallel
  uploads, replacing networkidle0 with explicit font/image readiness, focused
  tests and a fresh full dev measurement. No production build/deploy.
- Manual createDoc now prepares one model/logo, renders original, overlaps its
  signing with copy rendering, then signs copy. Rendering remains sequential to
  preserve service capacity; signing concurrency remains one. No retries.
- Signed originals/copies upload concurrently. Both settle before propagation;
  successful siblings are cleaned on partial failure before transaction rollback.
  Cleanup retains existing best-effort semantics and is not a durable retry job.
- Shared/local renderers wait for load, font readiness and successful image
  decoding before print; failed images/fonts fail closed. PDF layout/options,
  totals, journal/numbering/commit and authentication behavior remain unchanged.
  Pending-allocation/system billing orchestration is outside this optimization.
- Tests: six backend suites 55 passed initially; strengthened settlement test
  and added full create rollback/partial-upload regression, then both affected
  suites passed 25 tests (final distinct backend total 56). Service 20 passed.
  Real Chromium: four PDF fixtures + three numeric layout cases passed; corrupt
  embedded image rejected before PDF output. No production build or deployment.
- Standalone test initially hit occupied 8082; added PDF_SMOKE_PORT override and
  reran successfully on 8083, preserving active dev integration on 8082.
- Local helper restarted (verified own process tree only) with new source.
  New log: OS temp keepintax-pdf-dev/service.pipeline.stdout.log. Backend runtime
  confirmed loopback service, signing configured, dev DB and synchronize disabled.
- Await user's intentional new document + three previews for full measurement.
  Preserve pre-existing frontend environment change; no env/secrets committed.

## 2026-10-18 manual post-optimization measurements

- User performed two full manual creations and three previews. All five requests
  returned HTTP 201. No new fiscal documents were created by Codex itself.
- Baseline full backend HTTP total: 26,060ms (one prior successful request).
  New create totals: 7,557ms (a6d1948a-51c9-4783-b5de-3142fcb985c4) and
  5,655ms (068d1652-37dd-4fcb-8b38-1550ac5ca396), mean 6,606ms, 74.65% lower.
  First request includes Chromium launch 846ms; second uses cached browser.
- Shared preparation/logo occurs once per request: logo 976ms / 935ms.
  Original render 1,630ms / 791ms; copy render 681ms / 666ms overlaps original
  signing 1,900ms / 1,041ms. Copy signing 748ms / 603ms. Pair wall blocks
  5,301ms / 3,400ms (vs old sequential pair 18,151ms).
- Upload wall blocks 1,262ms / 1,324ms, with original/copy individual durations
  1,246/1,255ms and 1,296/1,320ms confirming overlap (old uploads 3,671ms serial).
- Preview backend totals: 1,777ms, 1,834ms, 1,756ms, mean 1,789ms; all succeeded.
  Previous successful preview totals 5,620ms / 6,523ms plus an intervening 504.
  No HTML load timeout occurred in these three new previews. Warm renderer HTML
  load 148-183ms and asset readiness 4-9ms across this batch.
- Results are small local samples, not a cloud benchmark or proof that timeouts
  cannot recur. Signer, logo/network and DB latency were also lower this time;
  the entire observed 74.65% reduction cannot be attributed solely to code.
  HTTP timings cover Express receipt through response finish, not later UI work.
- Implementation/manual measurement complete for this approved local task.
  No new code change, production build, access, push or deployment in this turn.

## 2026-10-18 preview-tab feedback and mutual request lock

- User approved local development loading feedback in the preview tab and blocking
  both preview/create actions while either request is in flight. No deployment.
- Static accessible RTL loading page is written immediately after synchronous
  desktop tab opening, replaced by PDF on success or static error on failure.
  No upstream error details/document data are interpolated into the status page.
  Mobile/PWA and blocked-popup fallback retain the in-app PDF viewer.
- Computed busy state includes preview/create and allocation finalization. Both
  buttons use it and handlers reject overlapping calls, including double confirms
  and pending-allocation creates. Deferred payload construction routes synchronous
  failures through existing error/finalize paths so locks always release.
- Final viewer explicitly replaces the status document. Object-URL pagehide
  cleanup is registered afterward and failed document writes revoke immediately.
- Focused isolated Karma/ChromeHeadless suite: 10 passed. Covers duplicate/cross
  action prevention, create success/error, payload throw, preview error/allocation
  restoration, blocked popup/mobile fallback, allocation busy, viewer replacement
  and object-URL cleanup. Initial test compile lacked Node typings for an existing
  FilesService console import; isolated config now matches app Node types.
- Real headless loading-page screenshot inspected (900x650): centered spinner,
  readable Hebrew status/subtitle and close button. No real fiscal document was
  generated by these tests. Existing dev frontend remains on port 4200.
- No backend/accounting/schema changes, no production build/push/deployment.
  Pre-existing frontend environment modification remains untouched and unstaged.

## 2026-10-18 discount display audit (investigation only)

- User requested all document types, findings and focused dev tests, with no
  calculation changes or deployment. No application source was changed.
- Added backend characterization suite: seven supported PDF types x five business
  types x zero/positive discount (70 cases), plus 22 mixed-VAT, field-alias,
  line-discount and original/copy cases. All 92 passed, reproducing CURRENT bugs;
  passing is audit evidence, not a claim that discount display is correct.
  Renderer capability matrix includes combinations not necessarily exposed by UI;
  GENERAL/JOURNAL_ENTRY are not issued-PDF types and are not part of this matrix.
- Licensed/company/authorized partnership: discount and before-discount rows are
  missing for all seven types: receipt, tax invoice, invoice-receipt, transaction
  invoice, credit invoice, quote, work order. Receipt has only total; credit model
  separately prepends VAT rows. Original/copy/preview share summary transformation.
- Exempt/exempt partnership: positive discount rows normally appear. However
  before-discount reads sumWithoutVat instead of sumBefDisBefVat. Normal initial
  transform sets them equal, masking the bug. Stored-document reconstruction
  computes sumWithoutVat after line discount, making divergent values possible;
  a divergent fixture 1000 before / 100 discount / 900 untaxed displays 900 before.
- All item tables ignore available disBefVatPerLine and show price*quantity before
  discount. E.g. 2*500 displays 1000 with no line-discount column despite net 900.
- Mixed VAT five non-credit invoice/quote/order types: taxable label uses full
  net including untaxed portion, then untaxed is displayed again. Fixture net
  1200, untaxed 300, VAT 162, final 1362 displays 1200 + 162 + 300 beside 1362.
  Credit model subtracts untaxed for taxable row but omits the untaxed row, showing
  900 + 162 beside final 1362. Final input values were not recalculated or changed.
- Separate arithmetic defect confirmed, NOT fixed: VAT-inclusive input 1180,
  discount 118, VAT18% yields line net900/VAT162/gross1062, while current document
  aggregation subtracts gross discount118 from net1000 and adds VAT162 -> 1044.
  Line discount-before-VAT is100 but aggregation uses line.discount118.
  Three frontend characterization tests (INCLUDE, EXCLUDE, WITHOUT) passed in
  isolated Karma/ChromeHeadless; EXCLUDE/WITHOUT fixtures reconcile. No real
  documents, DB reads/writes, signing or production build/deploy were needed.
- Any fix to the VAT-inclusive aggregate changes amounts and needs separately
  authorized scope; do not hide it by adjusting PDF-only amounts. Pure display
  fixes should preserve supplied net/VAT/final values and existing signed files.
