# Private PDF rendering service

Current operator release guide for the existing PDF service, backend and frontend:
[הוראות פריסה](../docs/features/pdf-service-release.md). The initial setup checklist
below is retained for context; use the current release guide for this update.

This service renders the existing approved document template. It has no database,
Firebase, FILLFASTER token, email integration or document-number allocation. The
backend retains validation of user/business access, document persistence, signing
and delivery. Existing signed files are unchanged.

## Runtime and boundaries

- Node 22.18.0 / Debian / Chrome for Testing 139.0.7258.154 from the exact
  Puppeteer 24.17.1 image digest used in the successful diagnostic builds.
- The **backend Dockerfile and its Node 18 runtime are unchanged**.
- One source of truth for layout: the service compiles
  `backend/src/documents/pdf/document-pdf.template.ts` and bundles the same fonts.
  Build the image with the repository root as context.
- `POST /v1/render` takes `{ version: 1, requestId, document }` and returns
  `application/pdf`. `document` is the existing `DocumentPdfModel`, including
  inline raster logo bytes. No file URLs, HTML, credentials or callbacks.
- 45s render deadline, bounded browser cleanup, 8MiB request, 20MiB output,
  original 1,000-row safety bounds. No limit on documents per customer.
- One render per instance. Cloud Run concurrency **1** directs parallel calls
  to other instances. Configure maximum instances to the desired budget/capacity;
  scaling has finite capacity and requests can still fail during saturation.
- HTML scripts disabled, network requests blocked. No customer data is persisted
  here. Responses use `no-store`; logs contain operational codes/timing/IDs only.
- Cloud Run IAM authenticates the HTTP boundary. Never deploy this renderer with
  `--allow-unauthenticated`. The backend service account alone gets invoker access.
  The container HTTP handler assumes that trusted platform boundary; direct local
  invocation is for development only.

## Local and automated checks

From `pdf-service`: `npm ci`, `npm run build`, `npm test`.
Windows can exercise the actual renderer and HTTP route using its installed
browser: `node scripts/smoke.cjs "C:/Program Files/Google/Chrome/Application/chrome.exe"`.
This binds loopback port 8082 and writes synthetic files under the OS temp
directory. It does not replace the Linux image verification below.
Build the image from the repo root:

```powershell
docker build -f pdf-service/Dockerfile -t keepintax-pdf:test .
docker run --rm --memory=1g --cpus=1 --network=none --entrypoint=node keepintax-pdf:test scripts/smoke.cjs
```

The real-browser smoke starts the HTTP service and renders receipts with/without
a logo, a multi-page invoice and a large-amount fixture; no application startup
or external calls. It also checks actual Chromium layout for grouped cents,
trillion-scale values, negative amounts, unbroken headings/summary labels and
numeric cells without overlap or overflow at the A4 printable width.
Without local Docker, from the repo root run the following **verification only**:

```powershell
gcloud builds submit . --config=pdf-service/cloudbuild.verify.json --ignore-file=pdf-service/source.gcloudignore --project=taxmyself-prod --region=me-west1
```

It does not deploy or push an image. Synthetic PDFs/report are uploaded to the
existing project Cloud Build bucket under `pdf-service-verification/BUILD_ID/`.
Inspect those PDFs before release. Build/unit-test success is not proof of
end-to-end DB, signing or IAM behavior.

To run the image locally with backend integration, publish port 8082 to 8080
bound to `127.0.0.1` and set **only in your feature worktree**:
`PDF_SERVICE_URL=http://127.0.0.1:8082`. Without this setting local development
continues using the installed local browser. Cloud Run refuses local rendering
when this setting is absent, preventing accidental backend memory usage.

## Operator deployment checklist (not executed by Codex)

1. Verify this service image with the command above; review output and PDFs.
2. Build/tag/push the same Dockerfile to your existing Artifact Registry repo.
   Do not deploy the backend Dockerfile as the PDF service. Do not copy backend
   environment variables or credentials into the PDF service.
3. Deploy the image as a **new**, IAM-protected Cloud Run service, in `me-west1`.
   Start with 1 CPU, 1GiB memory, concurrency 1, request timeout 60s. Keep the
   existing backend resources/runtime unchanged. Use a dedicated service account
   with no DB/storage/signing privileges. Confirm no public invoker bindings.
4. Grant `roles/run.invoker` on this PDF service to the **existing backend runtime
   service account**. Use its actual identity, not your human account or the Cloud
   Build account. Cloud Run provides the identity token through ADC; no new key
   file or shared API token is needed.
5. Configure `PDF_SERVICE_URL=https://<new-service>.run.app` on the backend (root
   URL without a path) and deploy the backend **code** from this branch using its
   unchanged Dockerfile. The Google ID token audience is that root URL.
6. Verify in a nonproduction environment: preview with/without logo; issuance
   with FILLFASTER signing; multipage file; pending-allocation finalization;
   unauthorized caller rejection; remote failure produces an error and no
   unsigned output. Never generate real fiscal documents as smoke fixtures.
7. Before production traffic, verify the backend resolves private IAM access and
   the intended service account. No DB or frontend change is required. Keep the
   previous backend revision for rollback. Rollback reverts to its prior local
   renderer, including its known browser issue; it is not an alternative fix.

Example operator commands, after verification (replace the placeholder values
with actual existing registry/service identities; these commands change cloud
resources and are **not** run by the verification command):

```powershell
$image = 'me-west1-docker.pkg.dev/taxmyself-prod/EXISTING_REPOSITORY/keepintax-pdf:REVIEWED_COMMIT'
$pdfAccount = 'DEDICATED_PDF_ACCOUNT@taxmyself-prod.iam.gserviceaccount.com'
$backendAccount = 'EXISTING_BACKEND_ACCOUNT@taxmyself-prod.iam.gserviceaccount.com'

gcloud builds submit . --config=pdf-service/cloudbuild.publish.json --ignore-file=pdf-service/source.gcloudignore --substitutions="_IMAGE=$image" --project=taxmyself-prod --region=me-west1
gcloud run deploy keepintax-pdf --image="$image" --service-account="$pdfAccount" --no-allow-unauthenticated --memory=1Gi --cpu=1 --concurrency=1 --timeout=60 --min-instances=0 --project=taxmyself-prod --region=me-west1
gcloud run services add-iam-policy-binding keepintax-pdf --member="serviceAccount:$backendAccount" --role=roles/run.invoker --project=taxmyself-prod --region=me-west1
```

The publish build runs the same image unit tests and HTTP/browser smoke before
pushing. Review maximum-instance settings in Cloud Run before routing backend
traffic. Do not add public invoker access or copy the backend's service account
permissions onto the PDF account. The main backend rollout is a separate step
after source review; deploy this branch's backend code with `PDF_SERVICE_URL` set,
using its existing deployment process and unchanged Dockerfile.

Production deployment is manual under `docs/coordination/PRODUCTION_POLICY.md`.
Codex has not created cloud resources, changed IAM, deployed or used production.

## Adding a queue later

The versioned render job is deliberately independent of HTTP. A future worker
can load that same payload and call the same `render(job)` function. Rendering
has no accounting, signing or storage side effects; duplicate render execution
cannot allocate another document number or sign a second document.

Adding a queue still requires real implementation: durable job IDs/state,
tenant-bound payload/result storage, deduplication, bounded retries and retention,
an outbox/atomic enqueue after issuance state is stored, and a status/result API.
Store large/logo-containing jobs in private storage and queue a reference instead
of assuming they fit a queue message. Retrying a job must reuse its captured
payload, not reload mutable branding. Never put signing/accounting into a generic
retry loop. UI/API changes will be needed if issuance becomes asynchronous.
The current HTTP client does **not** auto-retry or persist jobs; no queue exists.

Authentication reference: [Cloud Run service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

## Development timing diagnostics

With NODE_ENV=development, the renderer emits pdf_render_stages (PREPARE,
BROWSER_LAUNCH, PAGE_SETUP, HTML_LOAD, ASSET_READY, PDF_PRINT, CONTEXT_CLOSE). The backend
emits correlated pdf_operation_stage, pdf_create_stages and pdf_http_total events, plus
pdf_local_render_stages when using its local browser. No document content is
logged. Production does not emit these development events.

For three alternating synthetic logo/no-logo pairs, set NODE_ENV=development
and PDF_DIAGNOSTIC_PAIRS=1 in the test shell and run scripts/smoke.cjs with the
local Chrome path and an output directory. This uses the existing compiled
shared template, actual HTTP server and a reused browser with an isolated context per document. It does
not exercise backend DB/storage/IAM or Cloud Run cold starts.

## Chromium reuse (development verification, 2026-10-17)

Both the service and the backend local development path keep one browser per
renderer instance. Each document gets a new isolated BrowserContext, closed on
success or failure. Scripts and outbound requests remain blocked. `networkidle0`,
PDF options, deadlines and HTTP concurrency are unchanged. A disconnected browser
is replaced on the next request; failed jobs are not retried. The service retires
the browser on render errors/timeouts. Local context cleanup failure also retires
the browser. Context cleanup has a 2s bound; browser close has a 2s kill fallback.
Recycle after 100 uses (local recycling waits until no other render is active).
SIGTERM drains the service and closes its browser; Nest module destruction closes
the local browser. No Cloud Run billing or instance settings changed.

Paired local Windows Chrome / Node 22 measurements, old commit `c00ed0e2` vs reuse:

| Path and fixture | Before (ms) | After (ms) |
| --- | --- | --- |
| HTTP alternating logo/no-logo, six calls | 2315, 1636, 1833, 1517, 1666, 2152 | 2173, 1454, 1436, 1440, 1364, 1354 |
| Local backend renderer, six identical synthetic receipts | 3219, 1818, 2115, 1744, 2109, 1764 | 1918, 1056, 1478, 1459, 1432, 1416 |

Excluding the first call from each run: HTTP mean 1761 -> 1410ms (~20% lower);
local renderer mean 1910 -> 1368ms (~28% lower). First calls still launch Chrome.
Small sequential samples with normal machine noise, not a controlled cloud
benchmark. No DB, actual logo download, IAM, signing or full UI request measured;
these numbers do not predict production end-to-end latency. Warm launch stage
rounded to 0ms, context cleanup 9-16ms in these runs. Existing compiled template
was reused; no production build, infrastructure access or deployment occurred.

## Full development document timing

Use Node 22 to run `scripts/dev.cjs` from `pdf-service`. It binds only
`127.0.0.1:8082`, uses the existing compiled template and local Chrome, and logs
renderer timings. It has no DB or signing integration. Override the browser path
with `PDF_CHROME_EXECUTABLE`, or the local port with `PDF_DEV_PORT` if required.

In the feature worktree's ignored `backend/.env`, set
`PDF_SERVICE_URL=http://127.0.0.1:8082`, `NODE_ENV=development`, and
`DISABLE_SYNCHRONIZE=true`. Keep DB_DATABASE at the authorized development DB.
A full issuance also needs the existing backend-only `FILLFASTER_API_TOKEN`;
never copy it into the PDF service, Git, logs or chat. Restart the backend after
environment changes. The standalone service must stay running.

Development middleware assigns `X-Pdf-Diagnostic-Id` on preview/create requests.
`pdf_http_total` covers receipt by Express through response finish, including
validation/authentication. `DTO_TRANSFORM` records preparation in the controller.
`pdf_create_stages` contains sequential intervals for DB/number reservation,
save, journal, original/copy generation, uploads, parent/email, commit and cleanup.
`pdf_operation_stage` breaks PDF preparation/render and signing apart. SERVICE_HTTP
also carries a `renderRequestId`, matching the standalone renderer's request ID.
Nested spans must not be added to their parent durations. These measurements do
not include browser queueing, network before Express, or UI processing afterward.

Optional `PDF_DIAGNOSTICS_FILE` writes only these sanitized development events as
JSONL to a local file. It contains durations, generated correlation IDs, status
and configuration-presence booleans; no document, credential or user data. No
additional events or file writes occur unless NODE_ENV is development. Existing
application logs are separate and must not be copied wholesale for diagnostics.

For the current local session, the service stdout is under the OS temp folder
`keepintax-pdf-dev/service.stdout.log`, and the backend timing-only file is
`keepintax-pdf-dev/backend-timings.jsonl`. Have the user create one intentional test
document in dev, then correlate that request's successful HTTP total with its
stage spans and both renderer request IDs. Do not create an extra fiscal document
merely to probe readiness. No cloud IAM/cold-start/CPU behavior is simulated here.

### Failure investigation from the first full dev attempt

- Full create request: 12,736ms / HTTP 503. DTO 56ms, DB/journal setup about
  2,324ms, logo download 2,197ms, renderer HTTP 2,713ms, failed signing 4,622ms.
  Preparation/render parent span was 5,217ms and includes logo/render; do not add
  it again. Failure happened before copy generation or uploads. No successful
  issuance was measured.
- Separate preview: 23,821ms / HTTP 504. Logo download 1,584ms, renderer HTTP
  21,870ms. Renderer HTML_LOAD alone was 20,972ms; PDF_PRINT was never entered.
  The underlying reason for the HTML load timeout is still unknown.
- One synthetic unsigned PDF was rendered and submitted to the existing signer
  without DB writes, document numbering or email. Provider returned HTTP 401;
  it rejected the configured development authentication. Token format had no
  Bearer prefix or outer whitespace; its actual validity requires the operator.
- New development failure events contain only signing status/category and
  renderer request counts/pending resource types. They never log URLs, HTML,
  upstream bodies, token values or document content. `networkidle0` and timeout
  limits are unchanged. The cached browser is discarded on a render failure.
- After loading these diagnostics the local helper stdout is
  `keepintax-pdf-dev/service.diagnostics.stdout.log` in OS temp. Previous logs
  are preserved. A user preview retry is needed to capture the failing load.

## 2026-10-18 approved pipeline optimization (development)

- Manual `createDoc` prepares issuer identity, logo, tables and totals once for
  the original/copy pair. The same immutable request model is reused with only
  the document-type label changed; there is no cross-request branding cache.
- Original rendering completes before copy rendering, preserving service capacity
  1. Original signing overlaps copy rendering. Copy signing starts after both
  finish; no additional simultaneous signing requests, retries or unsigned paths.
- Upload both signed PDFs concurrently. Settle both outcomes before failure,
  attempt to delete successful sibling uploads, then propagate the original
  failure to the existing transaction rollback. Storage deletion remains the
  existing best-effort operation; an unavailable storage service can still leave
  an orphan, and no durable cleanup/retry mechanism was added.
- Other issuance paths (pending-allocation finalization/system billing) keep
  their existing orchestration. No accounting/numbering/signature policy changed.
- Both standalone and backend-local renderers now wait for `load`, then
  `document.fonts.ready`, successful image `decode()` and non-error font status.
  Asset failures stop printing. Existing PDF options/deadlines/network blocking
  remain. New diagnostic stage ASSET_READY separates asset readiness from HTML.
  This supersedes earlier statements that networkidle0 remains unchanged.
- Pipeline spans overlap: do not sum ORIGINAL_SIGN + COPY_RENDER to calculate
  wall time. Creation intervals SHARED_PREPARE_RENDER_SIGN_PAIR and UPLOAD_PAIR
  describe the nonoverlapping wall-time blocks. Per-operation spans still expose
  individual download/render/sign/upload durations.
- `PDF_SMOKE_PORT=8083` lets the isolated smoke coexist with the local helper on
  8082. The current updated local helper stdout is under OS temp at
  `keepintax-pdf-dev/service.pipeline.stdout.log`; prior logs are preserved.
- Focused checks: 56 backend tests across six suites (including the final two
  suites rerun after strengthening failure coverage); 20 standalone tests.
  Four real Chromium HTTP PDFs passed (logo/no-logo/multipage/large amounts),
  three numeric layout cases passed, and invalid embedded PNG was rejected
  before printing by real Chromium. Existing compiled template reused; PDF byte
  lengths matched the prior fixture run. No production build/deploy.
- Synthetic regression HTTP elapsed times: cold logo 1475ms, warm no-logo 575ms,
  multipage 700ms, large amounts 777ms. These are isolated checks, not full
  document latency or a guarantee of production improvement. Full manual dev
  comparison against 26,060ms remains pending the user's next test.
