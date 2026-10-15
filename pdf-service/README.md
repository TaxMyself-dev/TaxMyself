# Private PDF rendering service

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
a logo and a multi-page invoice; no application startup or external calls.
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
