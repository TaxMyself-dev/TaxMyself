# KT-061 - Uniform-file API contract and SHAAM reuse boundary

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base: local branch HEAD plus uncommitted KT-056 through KT-060 work
  (no commit will be created in this task)

## Business outcome

Define the safe, testable implementation boundary for transmitting the already
validated format-1.31 `INI.TXT` and `BKMVDATA.TXT` pair to SHAAM from 1 January
2027, while reusing only suitable parts of the existing invoice-allocation
sandbox prototype.

This task is contract/design only. It performs no live SHAAM request, schema
mutation, credential change, production action, commit or push.

## Source baseline

The following user-supplied official documents were read in full:

| Source | Date/version | SHA-256 | Governing facts used here |
|---|---|---|---|
| `הנחיות API מבנה קבצים אחיד.pdf` | 1.0 / March 2026 | `0C45C131453DDEDA0D1401A547B1107500996E9F7CB4D24F81AE0365A560F025` | Upload-links request/response, resumable Google upload, chunk sizes, file-status API |
| `עדכון הוראות מבנה קבצים אחיד.pdf` | 16 July 2026 | `0D2BDDE2703857EA999C761CB81265F97AC0CEF42D7405FE562D007336E9408E` | Mandatory support begins 1 January 2027 |
| `מצגת לבתי תוכנה - 22-09-2026 - סופית.pdf` | September 2026 | `132B88C468BF0AAFE5B96D9C3465DD3DA1BF7C4325A01883BE0D6B73921E6A1A` | Daily-token policy, exact scopes, production flow constraints, sandbox limitations |

The Tax Authority's public sample repository was also reviewed. It explicitly
labels its Angular implementation as sample-only and not production-ready.

## Confirmed external contract

### Regulatory and operational boundary

- Mandatory support starts on `2027-01-01` and is a software-registration
  condition.
- The business process begins with a Tax Authority inspector creating a file
  demand. A taxpayer/representative then generates and transmits the pair.
- Production cannot be exercised freely: the upload-links service checks that
  a demand exists for the case and period.
- Sandbox upload is connectivity-only: it accepts PDF files up to 1 MB and does
  not run the real business validation pipeline. Sandbox status is a mock.

### Authentication

- OAuth2, user-restricted.
- The September 2026 presentation specifies a 12-hour **Daily Token** and says
  long-term authorization storage is unnecessary for this service.
- Required scopes are distinct:
  - `UniStructFileUploadLinksApi`
  - `FilesStatusApi`
- This is not the existing invoice-allocation `longtimetoken` flow and must not
  share its literal `scope` setting or assume refresh-token semantics.

### Step 1 - reserve upload links

`POST` JSON to the environment-specific
`UniStructFileUploadLinksApi/v1/UploadingFile/GetUrlsForUploadingFiles` endpoint
using the server-held bearer token.

Request:

```json
{
  "caseNumber": 199999996,
  "startPeriod": "2025-01-01",
  "endPeriod": "2025-12-31",
  "representorCompanyId": 19996
}
```

- `caseNumber`, `startPeriod` and `endPeriod` are required.
- `representorCompanyId` is sent only when the authenticated operator acts as
  an employee of a representative.
- Although one extracted heading in the March document is visually ambiguous,
  its examples and the September presentation use `YYYY-MM-DD`; that is the
  implementation contract pending portal verification.
- Success returns `data.uniqueId` and exactly two `files` objects, ordered INI
  first and BKM second. Each contains `fileName`, `signUrl`, `fileUniqueId` and
  headers including `x-goog-content-length-range` and `x-goog-resumable`.
- The implementation must additionally validate the returned names/shape and
  fail closed rather than trust array order alone.
- Preserve both `fileUniqueId` values for status tracking.

Expected errors include 400/502 business/upstream responses, 401 authentication,
406 missing case permission and 500 server failure. Error bodies must be
normalized without logging tokens, signed URLs or unnecessary taxpayer data.

### Step 2 - initiate each Google resumable upload

For each returned file:

1. Parse `x-goog-content-length-range` and reject locally when the actual byte
   length exceeds the returned maximum.
2. `POST` to that file's `signUrl`, with no body and all headers returned for
   that file.
3. Require HTTP `201 Created` and a `Location` response header.
4. Treat both `signUrl` and `Location` as short-lived bearer-capability secrets;
   never return or log them.

### Step 3 - upload file bytes

`PUT` the exact generated Windows-1255 buffer to the `Location` URL.

| Total file size | Chunk size |
|---|---:|
| Up to 32 MB | One request containing the full file |
| Above 32 MB through 250 MB | 33,554,432 bytes |
| Above 250 MB through 1 GB | 67,108,864 bytes |
| Above 1 GB | 134,217,728 bytes |

The official sample uses sequential `PUT` requests with `Content-Range`.
Intermediate chunks return `308 Resume Incomplete`; completion returns 200/201.
Both INI and BKM must finish. A successful upload of only one file is not a
successful pair submission.

### Step 4 - poll status

`POST` JSON to the environment-specific
`FilesStatusApi/v1/Files/get-file-status` endpoint, with a list such as:

```json
[{ "fileName": "<fileUniqueId>" }]
```

HTTP 200 is only transport-level success. Every returned item must be checked:

- `Uploaded`: uploaded and waiting for processing.
- `Approved`: accepted.
- `Rejected`: rejected; `description` contains the reason.
- `isFound=false`: `status` is empty and `errorCode`/`errorMessage` describe
  not-found or permission failure.

The pair is approved only when both file IDs are `Approved`.

## Existing Keepintax SHAAM infrastructure assessment

### Reusable after isolation and tests

- Nest `HttpModule` integration and timeout pattern.
- AES-256-GCM utility concept for any server-side sensitive value that must be
  durable (with a future key-version/AAD improvement).
- Environment-selection concept, provided it fails closed and uses verified
  portal URLs per product and environment.
- Business-level token association concept, after actor/business authorization
  is enforced.
- Existing uniform-file generator result: separate Windows-1255 INI/BKM buffers,
  local validation and ZIP download fallback.

### Must not be reused as written

- `SHAAM_SCOPE = 'scope'` and the `/longtimetoken/` authorize/token endpoints.
- Browser retrieval of plaintext tokens through `GET /shaam/access-token`.
- Browser-supplied bearer tokens to `/shaam/invoices/approval`.
- Callback redirect containing access/refresh tokens in the query string.
- Full token/curl/payload/response logging.
- Process-local OAuth state map, optional state handling and code exchange
  before durable user/business validation.
- Unguarded SHAAM controller routes and unscoped business-number lookups.
- Blank/inferred production endpoints.

These are existing P0 findings, not hypothetical future concerns. The old
allocation prototype having worked in sandbox confirms connectivity only; it
does not make it a safe base for production or for the uniform-file service.

## Target architecture

### Server-only boundaries

1. Frontend asks Keepintax to connect/check connection or submit a generated
   uniform file for an owned/authorized business.
2. Backend authenticates the real actor and resolves business access before any
   SHAAM action.
3. OAuth tokens, signed URLs and upload session URLs stay server-side.
4. Backend generates and validates INI/BKM, calculates SHA-256 and byte lengths,
   requests links, uploads both buffers and records identifiers/status.
5. Frontend receives only safe internal submission ID, state and user-facing
   error text.

### Proposed submission state machine

```text
GENERATED
  -> AUTH_REQUIRED
  -> LINKS_RESERVED
  -> INI_UPLOADED
  -> PAIR_UPLOADED
  -> PROCESSING
  -> APPROVED | REJECTED

Any network boundary may also enter RETRYABLE_FAILURE or UNKNOWN_OUTCOME.
```

`UNKNOWN_OUTCOME` must be polled using saved `fileUniqueId` values before a new
link pair is requested. Blind retries after an ambiguous timeout are forbidden.

### Proposed persistence for implementation approval

A dedicated `uniform_file_submission` table is recommended rather than adding
more columns to `business`:

- internal ID; business ID/number snapshot; actor Firebase ID;
- environment; period start/end; representative ID when applicable;
- state and per-file status;
- generated INI/BKM SHA-256 and byte lengths;
- SHAAM set `uniqueId`, returned file names and both `fileUniqueId` values;
- safe error category/code/message; retry count;
- created/generated/uploaded/last-polled/completed timestamps.

Do not persist file contents, OAuth tokens, `signUrl` or upload `Location` in
this table. If resumability across process restart later requires temporary
capability URLs, that requires a separate encrypted, expiring secret design.

Recommended uniqueness/idempotency key:

`environment + businessId + periodStart + periodEnd + iniSha256 + bkmSha256`

An explicit user action may create a new version after the underlying file
changes. The same artifact must resume/poll its existing submission instead of
silently creating another set.

## Implementation sequence

### 3B - immediate security boundary and OAuth separation

- Add Firebase authentication and owner/delegation authorization to every
  SHAAM route.
- Remove token-return and browser-token relay paths.
- Remove token/curl/signed-response logging.
- Introduce product-specific OAuth configuration; uniform file uses the exact
  Daily Token endpoints/scopes confirmed in the active portal.
- Add offline controller/security tests. No live call.

Gate: no token reaches URL, browser storage/JS, logs or API responses; cross-
business tests pass.

### 3C - submission entity and deterministic orchestration

- Add the approved entity and append its DDL to the repository's controlled
  schema/cutover path; do not rely on TypeORM synchronize.
- Generate/validate the pair, store hashes/metadata and enforce idempotency.
- Add submission-status API returning only safe internal state.

Gate: persistence/retry/restart/concurrency tests pass.

### 3D - upload client against mocks

- Implement upload-links client, response validation, size checks, resumable
  initiation, chunked PUT and status client.
- Contract-test 201/Location, 308, 200/201 completion, partial pair, 400, 401,
  406, 422, 500, timeout and unknown outcome.
- Use exact Windows-1255 buffers already returned by `ReportsService`.

Gate: zero external calls; all mock/contract tests and backend build pass.

### 3E - user flow

- Keep existing ZIP download available.
- Add explicit connection/submission/status UI with clear partial/error states.
- Do not label `Uploaded` as approved.

Gate: frontend tests/build and authorization matrix pass.

### 3F - controlled sandbox acceptance

- User completes interactive authorization; no credential automation.
- Sandbox sends only the PDF test artifact allowed by SHAAM, up to 1 MB.
- Verify connectivity and fixed/mock status behavior; retain redacted evidence.

Gate: sandbox evidence passes. This still does not prove production business
validation.

### 3G - production readiness and canary

- Confirm current portal endpoints, Daily Token flow, scopes, product
  subscriptions, callback and production activation.
- Use one real inspector demand and one explicitly authorized business only,
  with explicit approval immediately before the external submission.

Gate: both files approved, Keepintax record reconciled, redacted audit reviewed.

## Decisions and open confirmations

Decided:

- Keep the uniform-file integration backend-only.
- Reuse the generator buffers, not the current browser-token flow.
- Separate product OAuth/scopes from invoice allocation.
- Persist pair/file IDs and states before offering automatic retries.
- Keep production disabled by default and keep ZIP download as fallback.

Must be confirmed in the authenticated Tax Authority portals/support before a
live sandbox implementation:

- Exact Daily Token authorize/token URLs and whether one token may carry both
  required scopes.
- Separate sandbox/production client applications or credentials actually
  assigned to Keepintax.
- Exact callback URI registered for each environment.
- Current product subscription/activation status for both APIs.
- Signed/upload URL expiry and supported resume/query semantics after restart.
- Whether status polling has rate limits/recommended cadence.
- Representative-role source and authorization semantics for
  `representorCompanyId`.

## Acceptance and verification

- [x] Read the three supplied official documents in full.
- [x] Verify the current official upload sequence, request fields, responses,
      chunk tiers and statuses.
- [x] Inspect the existing SHAAM module and map safe/unsafe reuse.
- [x] Inspect only SHAAM-related environment-variable names, never values.
- [x] Define state, persistence, idempotency, security and staged gates.
- [x] Make no live SHAAM request, schema/data mutation, commit or push.

## Handoff

- Recommended next task: **3B security boundary and OAuth separation** before
  adding any upload endpoint.
- The 2,000-record simulator fixture remains a separate registration-evidence
  task and does not block 3B-3E engineering.
- No code or database behavior changed in KT-061.
