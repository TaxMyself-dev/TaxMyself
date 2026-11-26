# PDF screen-entry preload and image encoding — 2026-11-26

Baseline `5db0e1cd057400759728da54c7e796f87c08f2e4`. Final executable fingerprints and all numeric
runs are in [sanitized evidence](evidence/pdf-entry-logo-2026-11-26.json).

## Entry-screen warmup

Selecting the issuing business (including initial page entry and draft/opposite
document context changes) starts advisory `POST /documents/preload-pdf` without
awaiting it or locking preview/create. No form/customer data is sent, only the
selected issuer number. Class-level authentication/subscription checks and an
explicit current-owner business lookup precede any private-logo/cache access.
The frontend cancels its subscription on business switch/destruction; failure
has no toast or effect on issuance. Same-business repeats within the page are
suppressed; a new page entry tries again.

The backend concurrently preloads the current business's PDF logo and probes
the standalone service's existing `/healthz` with the same validated fixed URL,
service IAM, no redirects and bounded transport as rendering. The PDF service
already completes synthetic warmup before listening, so a request waking it
also waits for startup readiness. Loopback development omits IAM only as before.
Standalone health does not occupy render capacity. Local in-process mode uses
a synthetic unsigned render. Renderer readiness work coalesces and successful
probes have a 60-second cooldown; failures can be tried at the next entry.
Logo uses the existing bounded ten-minute immutable-path cache. Issuer lookup
is always current, including replacements/removal. No persistent issuer/model
cache, document issuance, signature, email, DB write or new schema is involved.

Warmup moves work into form-filling time; it does not eliminate that work.
If the user creates immediately or the cloud instance disappears later, part
of the wait can remain. This does not configure minimum instances or keep a
server alive continuously. `PDF_WARMUP=false` still explicitly opts out of
standalone startup rendering; a health probe does not override that setting.

## What occupied the PDF

The previously downloaded real DEV signed original was 759,876 bytes. Its one
640×640 lossless RGB image stream occupied 734,331 bytes (96.6% of the file),
embedded font streams 7,959 bytes (1.0%), other streams 9,296 bytes; the balance
is PDF structures/signature overhead. Fonts were not the dominant source.

PDF-only normalization still crops to the existing centered 640px circle source,
preserving existing dimensions/layout and no enlargement. For images without an
alpha channel it compares PNG with JPEG quality 92 / 4:4:4; JPEG is chosen only
when at least 20% smaller. Transparent artwork and small efficient PNGs remain
PNG. Correct MIME accompanies cached bytes. Storage originals, user/profile
downloads, uploaded paths and already-issued PDFs are unchanged. JPEG is lossy;
the sample image PSNR was 42.86dB, and rendered output was
visually checked at document size. This sample does not prove identical pixels
or quality for every possible logo. No font/template/signing changes were made.

## Local rendering before/after

`node pdf-service/scripts/benchmark-entry-logo.cjs` — exit 0. Prerequisites:
backend build, PDF template dist, local Chrome, and private fixture
`.test-tmp/entry-logo/source-logo.png` extracted from the existing DEV PDF image.
No fixture/document/customer contents are tracked. The harness compiles the
baseline image normalizer from Git and uses the actual candidate normalizer,
same real Chromium/template, sequential original/copy rendering with fresh
isolated BrowserContexts. Three repetitions of three scenarios, two variants,
two files = 36 PDFs. Variant order reverses on the second repetition.

| Pair render wall time, mean | Before | After |
| --- | ---: | ---: |
| no-logo | 1.276s | 1.082s |
| actual-logo | 1.844s | 1.205s |
| allocated-multipage | 1.943s | 1.459s |

Actual-logo sample original: 756,632→124,926 bytes (83.5% smaller).
55-row allocation-marker sample: 857,332→225,626 bytes. The allocation is
synthetic layout content, not a SHAAM request. No-logo control bytes stayed
20,701. Its timing also varied, so not all measured gains are attributable to
compression. Actual-logo mean HTML load per file fell roughly 314→139ms and PDF
printing 308→163ms. Context/page setup remains a cost. Rendering was therefore
improved through lower image decode/layout/print payload; concurrency stays one
in standalone, with a fresh context per document and existing failure cleanup.
No speculative page sharing or parallel rendering was introduced.

Separate fresh-browser startup check: three cold and three pre-warmed cases,
order reversed in repetition 2. First customer-like render mean
1.260→0.567s after warmup; synthetic warmup itself cost
1.280s on average, outside that render measurement. This is local
browser startup, not measured Cloud Run scale-from-zero latency or a guarantee
for Belgium.

## Read-only DEV integration before/after

`node .local-ai-dev/check-entry-preload.cjs` — exit 0. Private diagnostic helper
uses asserted keepintax-dev, a read-only lookup of the previously authorized
test business, actual Firebase image download and loopback PDF service 8082.
Actual `preloadPdf` and cache/transport methods run; document models contain
synthetic identity/lines only. Two repetitions with reversed variant order,
fresh backend cache per case, eight unsigned PDF outputs, zero signing requests,
storage writes, mail, journal/numbering changes or SHAAM calls.

| Pair preparation stage, mean | Before | After |
| --- | ---: | ---: |
| Logo fetch on demand | 1.972s | 0.000s |
| Original+copy rendering | 1.329s | 0.708s |
| On-demand sum | 3.301s | 0.708s |

After preload itself took 1.171 / 1.551s. The integration deliberately waits for
it to finish, representing completed form-filling time; it is not free work.
DEV sample original 752,624→120,918 bytes; copy 752,695→120,989 bytes.
These figures exclude signatures, PDF storage upload, issuance SQL and browser
interaction, and must not replace previous full issuance averages. Backend/PDF
are local, not Belgium. No live allocation-number test or new signed-size/
provider-timing claim is made.

## Quality and verification

All 22 before/after PDF pairs (18 local matrix + 4 DEV integration) have identical
extracted text and page counts. One-page and four-page final original fixtures
were rendered with pypdfium2; the first and last pages were visually inspected
for RTL, logo, tables, totals and footer. Transparent/flat PNG preservation,
MIME/cache isolation, authorization-before-cache, in-flight preload coalescing,
failure tolerance, HTTPS IAM and URL validation have focused tests.

Backend command:
`npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/pdf-entry-preload.spec.ts src/identity-images/pdf-logo-encoding.spec.ts src/identity-images/image-cache.spec.ts src/identity-images/identity-images.spec.ts src/documents/pdf/document-pdf-client.spec.ts src/documents/pdf/document-pdf-routing.spec.ts`

Final backend result: 6 suites / 70 tests passed, zero snapshots, exit 0, 80.522s. The earlier 69-test run passed before adding the HTTPS IAM case. An initial backend build returned exit 1 without compiler diagnostics; the unchanged rerun completed with exit 0.

Frontend command:
`npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.doc-preview.spec.json --include=src/app/pages/doc-create/doc-create-request.spec.ts --progress=false`
— 28 tests passed, exit 0. Expected mocked error-path console messages occur;
ChromeHeadless shutdown required the launcher's kill fallback after tests passed.
`npm run build` in backend and `npm run build:dev` in frontend — exit 0.
Frontend retains existing SCSS/initial-bundle budget and CommonJS warnings.
`npm test` in pdf-service — 27 passed, 0 failed, exit 0, 877ms.

Live UI validation was attempted on the requested existing 4204 tab but browser
control repeatedly timed out before a page state/action could be verified.
No UI-success claim is made; frontend behavior tests and actual read-only DEV
service integration provide the executed evidence. No new issued documents or
signatures were created in this increment. DEV backend restored to candidate
after mode, queue still enabled, unrelated schedulers disabled. No production
deployment, cloud configuration, main integration or schema changes.
