## Purpose
Integrates with the Israel Tax Authority's SHAAM OpenAPI — OAuth2 authorization per business and invoice-approval ("חשבונית מס" allocation number) submission.

## Invoice allocation safety

- Supplier allocation uses `Invoices/v2/Approval` only. Customer-side Invoice
  Information endpoints are not recovery endpoints for this flow.
- Persist `PROCESSING` before the call. An expired lease becomes
  `UNKNOWN_OUTCOME` and is never replayed automatically.
- Save the allocation, `APPROVED` state and actual provider HTTP success status
  atomically before local finalization.
- Only guarded admin endpoints resolve unknown outcomes with evidence. See
  `docs/features/shaam-allocation-state-machine.md`.

## Key entities/files
- `shaam-secure.controller.ts` — authenticated, business-scoped connection/status and allocation routes plus the state-bound OAuth callback. It never returns tokens.
- `entities/shaam-connection.entity.ts` / `shaam-oauth-state.entity.ts` — product/environment-separated encrypted connections and hashed, durable, single-use OAuth state.
- `entities/uniform-file-submission.entity.ts` — pair-level uniform-file artifact/status metadata; never stores file bytes or capability URLs.
- `services/shaam-oauth.service.ts` — `ShaamOauthService`: builds the authorize URL, exchanges an auth code for tokens, refreshes tokens. Requires `SHAAM_CLIENT_ID`/`SHAAM_CLIENT_SECRET`/`SHAAM_REDIRECT_URI` env vars (throws at construction if missing).
- `services/shaam-invoices.service.ts` — low-level SHAAM HTTP client for Approval and the official `Invoice-Information/confirmationNumber` recovery endpoint.
- `services/shaam-document-allocation.service.ts` — persisted-invoice orchestration: loads the final invoice identity, builds fiscal fields server-side, persists the returned allocation number, and only then invokes document finalization.
- `shaam.constants.ts` — sandbox allocation URLs and fail-closed, explicitly enabled production configuration.
- `uniform-file/` — isolated, disabled-by-default OAuth foundation for the
  uniform-file Daily Token. It has exact product scopes, verified Tax Authority
  hosts and a separate production kill switch.
- `utils/shaam-encryption.util.ts` — `encryptToken`/`decryptToken` used by `ShaamConnectionService`; plaintext never leaves the backend.
- `dto/shaam-*.dto.ts` — OAuth token response, approval request/response shapes.

## Main flows
- `POST /shaam/oauth/authorize` → `GET /shaam/oauth/callback` — authenticated initiation creates a hashed database state bound to actor/business/product; callback consumes it once and saves encrypted tokens.
- `GET /shaam/connection-status` — resolves/refreshes the server-held invoice
  allocation access token when necessary, then returns only safe connection
  metadata. An expired access token alone must not trigger browser reauthorization.
  Only an explicit OAuth `invalid_grant`/`invalid_token`/`invalid_scope`
  response marks the connection `REAUTH_REQUIRED`; `invalid_scope` means the
  saved grant cannot be upgraded through refresh and a new authorization is
  required. Timeouts, network failures, server failures and configuration
  errors are surfaced without discarding the existing grant.
  When a successful refresh omits a replacement refresh token, the previously
  encrypted refresh token is preserved.
  Refresh lifecycle events are emitted at enabled Nest log levels: `debug` for
  start/success, `warn` when reauthorization is required, and `error` for a
  transient/configuration failure that preserves the active grant. These logs
  contain only operation/outcome, environment, product, duration, bounded
  reason/category, expiry duration, token-rotation boolean and connection
  status. Never add tokens, actor/business identifiers or raw provider text.
- `POST /shaam/invoices/allocation?businessNumber=...` — accepts only `docNumber` + `docType`, resolves the server-held token, attempts official recovery first, and only when that succeeds without an existing number submits Approval before finalizing the persisted invoice. An ambiguous recovery error blocks Approval.
- `POST /shaam/invoices/allocation/recover?businessNumber=...` — retrieves a lost allocation response from the official recovery API using the persisted invoice fields; it never submits a replacement approval request.

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

The low-level invoice client emits one structured outcome log per external
Approval, confirmation-recovery or allocation-details call. These events are
safe for production operations: they include only the operation, environment,
Tax Authority gateway host, HTTP status, duration, configuration-presence and
result booleans, a bounded error category, an optional strictly validated
provider error code, and an allowlisted reason derived from provider text.
Never add access tokens, request/response bodies, raw provider messages,
VAT/business or customer numbers, invoice references, allocation numbers,
dates or monetary values to these logs.

The verified public tsandbox token exchange uses
`openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token`. Although the
downloaded OpenAPI metadata also advertises `t-ita-api.taxes.gov.il`, that host
did not resolve in the public sandbox flow. Do not switch the sandbox token URL
without a successful end-to-end verification.

Invoice-allocation operations in tsandbox are fail-closed to the dedicated
Tax Authority test issuer `777777715`. `SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBERS`
may provide a comma-separated allowlist when additional officially approved
sandbox issuers are needed. The guard covers connection status, OAuth
initiation, Approval and recovery; it never applies in production.

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
literal `scope`: the September 2026 Tax Authority guidance specifies a 12-hour
Daily Token and separate `UniStructFileUploadLinksApi` and `FilesStatusApi`
scopes. It may reuse only hardened server-side HTTP/encryption/environment
primitives. Uniform-file production remains disabled until verified portal
configuration is provided; see KT-061 through KT-063.

Invoice-allocation production configuration also requires
`SHAAM_INVOICE_CONFIRMATION_URL` and `SHAAM_INVOICE_DETAILS_URL`. Each
production endpoint is checked against its exact `/shaam/production/...` path
and the limited Tax Authority hosts in the downloaded portal specification;
both Invoice Information endpoints must be v2.

## Related topics
Depends on: business ownership, Firebase/delegation guard, documents invoice-allocation flow, and reports uniform-file generation.
