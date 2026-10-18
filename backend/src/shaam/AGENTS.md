## Purpose
Integrates with the Israel Tax Authority's SHAAM OpenAPI — OAuth2 authorization per business and invoice-approval ("חשבונית מס" allocation number) submission.

## Key entities/files
- `shaam-secure.controller.ts` — authenticated, business-scoped connection/status and allocation routes plus the state-bound OAuth callback. It never returns tokens.
- `entities/shaam-connection.entity.ts` / `shaam-oauth-state.entity.ts` — product/environment-separated encrypted connections and hashed, durable, single-use OAuth state.
- `entities/uniform-file-submission.entity.ts` — pair-level uniform-file artifact/status metadata; never stores file bytes or capability URLs.
- `services/shaam-oauth.service.ts` — `ShaamOauthService`: builds the authorize URL, exchanges an auth code for tokens, refreshes tokens. Requires `SHAAM_CLIENT_ID`/`SHAAM_CLIENT_SECRET`/`SHAAM_REDIRECT_URI` env vars (throws at construction if missing).
- `services/shaam-invoices.service.ts` — low-level SHAAM HTTP client for Approval and the official `Invoice-Information/confirmationNumber` recovery endpoint.
- `services/shaam-document-allocation.service.ts` — persisted-invoice orchestration: loads the final invoice identity, builds fiscal fields server-side, persists the returned allocation number, and only then invokes document finalization.
- `services/uniform-file-submission.service.ts` — prepares validated uniform-file pairs without contacting SHAAM, stores only hashes/byte lengths/safe metadata, regenerates an existing artifact from its persisted timestamp to enforce restart-safe idempotency, and scopes status reads to the authorized business.
- `shaam.constants.ts` — sandbox allocation URLs and fail-closed, explicitly enabled production configuration.
- `uniform-file/` — isolated, disabled-by-default OAuth foundation for the
  uniform-file Daily Token. It has exact product scopes, verified Tax Authority
  hosts and a separate production kill switch. `uniform-file-upload.service.ts`
  is the unexposed low-level client for reserving INI/BKM upload links,
  resumable Google Storage uploads and remote status reads.
- `utils/shaam-encryption.util.ts` — `encryptToken`/`decryptToken` used by `ShaamConnectionService`; plaintext never leaves the backend.
- `dto/shaam-*.dto.ts` — OAuth token response, approval request/response shapes.

## Main flows
- `POST /shaam/oauth/authorize` → `GET /shaam/oauth/callback` — authenticated initiation creates a hashed database state bound to actor/business/product; callback consumes it once and saves encrypted tokens.
- `GET /shaam/connection-status` — resolves/refreshes the server-held invoice
  allocation access token when necessary, then returns only safe connection
  metadata. An expired access token alone must not trigger browser reauthorization.
- `POST /shaam/invoices/allocation?businessNumber=...` — accepts only `docNumber` + `docType`, resolves the server-held token, attempts official recovery first, and only when that succeeds without an existing number submits Approval before finalizing the persisted invoice. An ambiguous recovery error blocks Approval.
- `POST /shaam/invoices/allocation/recover?businessNumber=...` — retrieves a lost allocation response from the official recovery API using the persisted invoice fields; it never submits a replacement approval request.
- `POST /shaam/uniform-file/submissions` — generates and validates the INI/BKM pair for an authorized business and period, then creates or reuses a `GENERATED` submission. It makes no Tax Authority request and returns no file bytes, hashes, tokens or capability URLs.
- `GET /shaam/uniform-file/submissions/:submissionId?businessNumber=...` — returns safe internal submission metadata only after the same business authorization check.
- `POST /shaam/uniform-file/submissions/:submissionId/transfer?businessNumber=...`
  — regenerates and verifies the stored artifact, atomically claims the
  submission, uses the server-held Daily Token, persists remote identifiers
  before uploading INI then BKM, and immediately performs the first poll.
- `POST /shaam/uniform-file/submissions/:submissionId/poll?businessNumber=...`
  — polls only the two persisted remote identifiers. Terminal APPROVED/REJECTED
  submissions are returned locally without another external call.

The upload client is intentionally not connected to a controller or submission
state transition directly; only `UniformFileSubmissionService` orchestrates it.
It validates the exact Tax Authority upload/status URLs,
classifies the returned INI/BKM links by file name, allows only the documented
Google resumable headers, rejects non-Google capability URLs/redirects and
keeps bearer tokens, signed URLs, session locations and upstream bodies out of
errors. `Uploaded` means processing is pending; a pair is approved only when
both remote file statuses are `Approved`.

An invalid upload-link envelope emits only a bounded structural diagnostic
(safe field names, value types and array counts). It must never log upstream
values, tokens, signed URLs, remote identifiers or the response body.
The downloaded upload-link schema's `uniqueId` pattern permits an empty value,
and the live tsandbox success fixture returns it. The client accepts exactly an
empty reservation-level ID only in tsandbox; production continues to require a
non-empty bounded identifier. Per-file identifiers remain mandatory everywhere.

Transfer retries never reserve a replacement pair when either remote file ID
already exists. They poll the saved identifiers instead. Network/storage
ambiguity becomes `UNKNOWN_OUTCOME`; an interrupted reservation claim without
persisted identifiers also fails closed and requires an explicit future
recovery policy rather than silently creating another pair.

Production and tsandbox recovery use
`invoice-information/v2/confirmationNumber` and send the persisted lookup in
lower snake case. The legacy v1 wire adapter has been removed. Production
configuration fails closed if a v1 confirmation or details path is supplied.
Every recovered allocation is checked through `invoice-information/v2/details`
against the persisted invoice type, issuer/customer VAT numbers, reference,
dates and totals before it can be saved. A production mismatch blocks both
storage and Approval. The tsandbox details endpoint returns a fixed fixture
even for nonexistent confirmation numbers; an explicit fixture mismatch in the
normal tsandbox flow is therefore treated as no recovery and proceeds to the
Approval test, while manual recovery still fails without writing. Network,
authentication and ambiguous details errors always block Approval.

The verified public tsandbox token exchange uses
`openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token`. Although the
downloaded OpenAPI metadata also advertises `t-ita-api.taxes.gov.il`, that host
did not resolve in the public sandbox flow. Do not switch the sandbox token URL
without a successful end-to-end verification.

Invoice allocation must never accept totals, dates, VAT numbers,
`invoice_reference_number` or `INVOICE_ID` from the browser. `INVOICE_ID` is
stable (`KT-{issuerBusinessNumber}-{generalDocIndex}`), and a returned
allocation number is committed to `Documents.allocationNum` before PDF/journal
finalization. A retry with a stored number finalizes the same document without
another SHAAM Approval call.

## Known security and reuse boundary

The historical browser-token controller, access-token endpoint, process-local
state map and `business.shaam*` columns were removed in KT-063. Do not recreate
them. Every new SHAAM product must use `ShaamConnection` and durable state.

The uniform-file API must not reuse the current `/longtimetoken/` flow or
literal `scope`: the authenticated sandbox portal specifications require a
12-hour Daily Token and the exact `UniStructFileUploadLinks_scope` and
`FilesStatus_scope` scopes. It may reuse the existing SHAAM application's
client credentials and callback, because both products are subscribed to that
application, while tokens remain separated by product. Uniform-file production
remains disabled until verified portal configuration is provided; see KT-061
through KT-063 and KT-078.

The uniform-file OAuth configuration falls back to `SHAAM_CLIENT_ID`,
`SHAAM_CLIENT_SECRET` and `SHAAM_REDIRECT_URI` when product-specific overrides
are absent. Verified tsandbox endpoints have safe defaults, but the integration
remains disabled unless `SHAAM_UNIFORM_FILE_ENABLED=true`. Production never
inherits guessed endpoints and still requires its separate activation switch.
OAuth state is random, hashed, durable and single-use in `shaam_oauth_state`;
there is no separate uniform-file state secret.

When the uniform-file integration is enabled, configuration also requires
`SHAAM_UNIFORM_FILE_UPLOAD_LINKS_URL` and `SHAAM_UNIFORM_FILE_STATUS_URL`.
Their host, environment segment and complete API path are validated at startup;
they must not be inferred from the invoice-allocation endpoints.

Local tsandbox testing may explicitly set
`SHAAM_UNIFORM_FILE_SANDBOX_CASE_NUMBER` to a nine-digit Tax Authority fixture
case (for example `777777723`). The override affects only the external
upload-link reservation request; business authorization, generated file
identity and persisted submission ownership continue to use the real business
number. Configuration rejects this override in production.

Invoice-allocation production configuration also requires
`SHAAM_INVOICE_CONFIRMATION_URL` and `SHAAM_INVOICE_DETAILS_URL`. Each
production endpoint is checked against its exact `/shaam/production/...` path
and the limited Tax Authority hosts in the downloaded portal specification;
both Invoice Information endpoints must be v2.

## Related topics
Depends on: business ownership, Firebase/delegation guard, documents invoice-allocation flow, and reports uniform-file generation.
