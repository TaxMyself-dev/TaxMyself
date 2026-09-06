# SHAAM invoice-allocation integration audit

Audit date: 2026-09-06

Repository base: `4c9ad8c9405a2c3cf257074b1f499036ac0c5146`

Scope: research and documentation only; no production or `keepintax_prodcopy` access, no live SHAAM call, and no source/schema/data/configuration change.

## Executive status

**Production status: NO-GO.** Keep the automatic SHAAM path disabled.

Keepintax contains a substantial sandbox prototype:

- backend OAuth authorization-code exchange and refresh;
- AES-256-GCM token encryption on `Business` rows;
- a SHAAM Invoices v2 approval client and DTOs;
- frontend callback, reusable manual approval dialog, and a document-derived automatic request method;
- a working manual production-safe user journey: save an above-threshold invoice as `PENDING_ALLOCATION`, obtain a number in the Tax Authority application, paste it into Keepintax, then generate PDFs and the journal entry.

The automatic path is not currently reachable from normal document creation. `DocCreatePage.confirmCreateDoc()` deliberately sends every qualifying invoice to the three-choice manual flow, and the automatic action in the incomes page is commented out. An admin-page test dialog remains visible and manually callable.

The prototype is unsafe to enable or point at production:

1. All `/shaam/*` backend routes lack `FirebaseAuthGuard`, subscription/module checks, and owner/delegation checks. A caller can initiate OAuth for an arbitrary business number, retrieve another business's plaintext bearer token by business number, or relay an arbitrary token and invoice payload to SHAAM.
2. The callback places the full access/refresh-token response in a frontend query parameter and logs it. The invoices service logs token fragments, then logs a complete curl command containing the full bearer token and client ID. This violates the current Tax Authority security posture and ordinary secret-handling rules.
3. OAuth `state` is optional at callback time, is not checked before code exchange, is stored only in one process's memory, is not bound to the authenticated Keepintax user, and is not durable across restart or multiple instances.
4. Production URLs are blank and `SHAAM_ENV=production` intentionally throws. No production configuration exists in the repository.
5. The request mapping is materially wrong or unverified: tax-invoice/receipt is sent as type `305` instead of official type `320`; `user_id` is populated with the issuer VAT number although the contract describes it as the service operator's ID; a fixed software number is embedded in frontend code; and synthetic test identifiers are fallback values in the document path.
6. Refresh-token metadata and one-time rotation semantics are incomplete. The official guide describes rotating, single-use refresh tokens plus `refresh_token_expires_in` and `consented_on`; Keepintax's response DTO stores neither metadata field.
7. There are no SHAAM unit/integration tests. A frontend build could not be established in this clean worktree because the committed frontend lockfile is out of sync.
8. A tracked HTTP request artifact contains bearer-token-like and client-ID-like values. They are not repeated here. Treat them as compromised, rotate/revoke them, remove the artifact in a separately approved remediation, and assess Git-history exposure before any sandbox or production use.

The shortest safe route is therefore not “fill in production URLs.” It is: rotate exposed sandbox credentials, complete the Tax Authority software-house onboarding in parallel, make the integration backend-only and tenant-scoped, align the payload/refresh/error contract, pass an isolated sandbox certification matrix, then perform one explicitly approved production canary for an authorized Keepintax-owned business.

## Current code map

### Backend

| Area | Files | Current behavior |
|---|---|---|
| Module | `backend/src/shaam/shaam.module.ts`, `backend/src/app.module.ts` | `ShaamModule` is always imported. `ShaamOauthService` construction throws if client ID, client secret, or redirect URI is missing, even while the feature is disabled. |
| Environments | `backend/src/shaam/shaam.constants.ts` | Defaults to `tsandbox`; uses `openapi.taxes.gov.il/.../tsandbox`; scope is literal `scope`; timeout is 10 seconds. Production values are empty and production selection throws. |
| OAuth client | `backend/src/shaam/services/shaam-oauth.service.ts` | Generates a 32-byte random state, creates an authorization URL, exchanges a code using HTTP Basic client credentials, and refreshes using a refresh token. It masks some values but still logs a code prefix and response metadata. |
| OAuth orchestration | `backend/src/shaam/shaam.controller.ts` | `GET /shaam/oauth/redirect` stores `{businessNumber,timestamp}` in a process-local map for ten minutes. `GET /shaam/oauth/callback` exchanges the code, optionally saves encrypted tokens, then redirects the full token response to the frontend. |
| Token retrieval | `backend/src/shaam/shaam.controller.ts` | `GET /shaam/access-token?businessNumber=...` decrypts and returns the bearer token to the caller; refreshes within a five-minute expiry buffer. No caller identity or business ownership is checked. |
| Approval proxy | `backend/src/shaam/shaam.controller.ts`, `services/shaam-invoices.service.ts` | `POST /shaam/invoices/approval` accepts a browser-supplied bearer token and body, validates the DTO and totals, adds bearer/client-ID headers, calls Invoices v2, and maps selected error shapes. The optional `businessNumber` query sent by the frontend is ignored. |
| DTOs | `backend/src/shaam/dto/shaam-*.dto.ts` | Defines token, approval request, and approval response shapes. Required request fields mostly match the bundled V2 schema, but enum/range/length rules and refresh metadata are incomplete. |
| Encryption/storage | `backend/src/shaam/utils/shaam-encryption.util.ts`, `backend/src/business/business.entity.ts` | Random-IV AES-256-GCM, with IV + auth tag + ciphertext stored as Base64. Access token, encrypted expiry timestamp, and refresh token are nullable default-length `varchar` columns. There is no key version, AAD/business binding, revocation status, refresh expiry, consent counter, or disconnect endpoint. |
| Business lookup | `backend/src/business/business.service.ts` | `getBusinessByNumber()` supports optional `firebaseId`, but every SHAAM call omits it. Business number is globally unique in the current entity, yet the SHAAM routes still disclose/mutate it without authenticating its owner. |
| Bundled artifacts | `backend/src/shaam/Invoices.yaml`, `shaam-api.http`, `shaam-api.postman.json`, `requests.http` | The OpenAPI file is a useful sandbox snapshot, but is not proven to be the currently subscribed portal contract. Other request artifacts are stale (some name a nonexistent route or omit `user_id`), and one contains credential-like material. Do not use them as executable truth. |

### Frontend and document lifecycle

| Area | Files | Current behavior |
|---|---|---|
| SHAAM HTTP client | `frontend/src/app/services/shaam.service.ts` | Redirects the whole browser to the backend, calls the callback as if it were a JSON endpoint, retrieves plaintext access tokens, and posts them back in an Authorization header. `getAuthorizeUrl()` targets a backend route that does not exist. |
| Callback page | `frontend/src/app/pages/shaam-callback/*` | Public route `/shaam/callback`. Parses the full token response from the URL or attempts a second code exchange, clears three legacy local-storage keys, then offers navigation. “Try again” omits the required business number. A successful backend redirect does not automatically return to the saved draft. |
| Reusable approval dialog | `frontend/src/app/components/shaam-invoice-approval-dialog/*` | Manually editable test form with embedded sample identifiers and fixed software number. Fetches a plaintext token, submits approval, and emits the response. Some displayed inputs (`user_id`, software number) are ignored/overridden on submit. |
| Admin path | `frontend/src/app/pages/admin-panel/*` | Visible SHAAM button opens the reusable test dialog. The top-level `admin-panel` route itself has no route guard in `app-routing.module.ts`; the SHAAM backend is also unguarded. |
| Document automatic prototype | `frontend/src/app/pages/doc-create/doc-create.page.ts` | `openShaamDialog()` and `sendAllocationNumberRequest()` derive an approval request from the form, but no template control calls `openShaamDialog()`. Tax invoice/receipt incorrectly maps to `305`; IDs and software number contain unsafe fallbacks/fixed values; `invoice_id` includes `Date.now()`, so retries are not stable. |
| Active manual decision | `frontend/src/app/pages/doc-create/doc-create.page.ts/.html` | For tax invoice or tax-invoice/receipt strictly above the date-based threshold, customer ID is required. Without an allocation number, the user can save pending, open the Tax Authority manual service, or issue without allocation after warning. |
| Pending/finalization | `backend/src/documents/*`, `frontend/src/app/pages/book-keeping/incomes/*`, `frontend/src/app/services/documents.service.ts` | `PENDING_ALLOCATION` reserves/persists a document and lines/payments but skips PDFs, upload, email, and journal entry. `POST /documents/finalize-allocation` optionally saves a pasted number, creates original/copy PDFs, uploads, posts the deferred journal, and opens/closes the document. It can also add a number to an already-issued document without duplicating the journal. |

### End-to-end sequences

#### Active manual path

1. User creates a tax invoice (`305`) or tax-invoice/receipt (`320`) above the threshold.
2. `confirmCreateDoc()` requires recipient ID and opens the manual decision dialog.
3. “Get allocation number” creates a `PENDING_ALLOCATION` document. Backend reserves the actual document number, persists header/lines/payments, but creates no PDF or journal entry.
4. Frontend navigates to incomes and opens a dialog linking to the official Tax Authority manual application.
5. User obtains and pastes the allocation number.
6. `POST /documents/finalize-allocation` generates/uploads both PDFs, stores the number, records the journal entry if it was pending, and changes status to `OPEN` or `CLOSE`.

Known defect: the row passed to incomes snapshots the pre-request “peek” document number rather than replacing it with `create-doc`'s returned reserved number. A concurrent issuance can therefore make the auto-open dialog target the wrong/nonexistent document. Reloading the incomes list avoids the stale navigation snapshot but does not fix the design.

#### Disabled automatic path as written

1. `openShaamDialog()` calls unauthenticated `GET /shaam/access-token` and receives the plaintext bearer token.
2. If missing, the page saves a draft and stores business/type in `sessionStorage`, then redirects through unauthenticated `GET /shaam/oauth/redirect`.
3. Backend stores state only in memory and redirects to SHAAM authorization.
4. SHAAM calls the backend callback; backend exchanges code before validating state, attempts an unscoped business save, then leaks tokens through logs and the frontend URL.
5. User must navigate from the callback page back to document creation for draft restoration.
6. The frontend constructs an approval request and sends the plaintext bearer token back to unauthenticated `POST /shaam/invoices/approval`.
7. On approval it only sets the in-memory form allocation number and asks the user to confirm ordinary document creation. Allocation and SHAAM response are not durably associated until document creation succeeds.

## Official contract and onboarding comparison

### Source discipline

All external technical claims below come from primary Israel Tax Authority/Government sources retrieved on 2026-09-06. The public invoice documents are dated 2023-2024 and still marked beta. The current authenticated developer-portal product definition was not accessible without credentials. Therefore any item marked **portal confirmation required** is deliberately not inferred from URL patterns or the repository snapshot.

Primary sources:

- [Connect software companies to SHAAM](https://www.gov.il/en/service/connect-to-shaam) — current service page; lists the connection procedure, registration authorization, undertaking, security appendix, developer-portal workflow, API specification, and digital application.
- [Software Company Connection Procedure — 11 January 2024](https://www.gov.il/BlobFolder/service/connect-to-shaam/he/Service_Pages_shaam_Software-Company-Connection-Procedure-Digital-Form-Submission.pdf) — requires corporate authorization where applicable, developer-portal accounts/requests in sandbox and production, signed undertaking/security appendix, and digital submission.
- [Tax Authority Open API developer-portal guide](https://www.gov.il/BlobFolder/service/connect-to-shaam/en/Service_Pages_shaam_Tax-Authority-Open-API.pdf) — organization/app/product registration, client ID and one-time-displayed client secret, subscription prerequisite, OAuth token/refresh behavior, and production access after customer-service approval.
- [Current data-security appendix](https://www.gov.il/BlobFolder/service/connect-to-shaam/en/Service_Pages_shaam_Data-Security-Appendix-Statement.pdf) — retrieved current version published in 2026; requires encrypted authentication data, 2FA, protected authentication logs, incident controls, and penetration testing for stated client-count thresholds.
- [Israel Invoice Model API Description, July 2024, English](https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/vat_software-houses-180724-en.pdf) and [Hebrew edition](https://www.gov.il/BlobFolder/generalpage/hor-software-other/he/vat_software-houses-180724.pdf) — Invoices v2 beta request fields, document codes, sandbox endpoint, responses, and delayed-invoice alternatives.
- [Manual request for an allocation number](https://www.gov.il/he/service/request-assignment-number-for-tax-invoice) — current 2026 threshold and required manual-request fields.
- [Digital authorizations](https://www.gov.il/en/service/authorize-certification-perform-digital-operations) — authorization roles, recipient acceptance, revocation, and maximum one-year grant duration.
- [Register computerized accounting software](https://www.gov.il/en/service/registration-software-designed-managing-computerized-accounting-system) — software offered for use by others is subject to registration; lists registration prerequisites and evidence.

### Comparison table

| Contract/onboarding item | Official sourced fact | Keepintax | Assessment |
|---|---|---|---|
| Software-house connection | Create/authorize the software-house identity, create developer-portal access, open sandbox and production requests, sign the undertaking/security appendix, and submit the digital request. | No evidence of approved onboarding is committed, which is appropriate for secrets but leaves activation status unknown. | Owner must verify each external milestone; do not equate existing client-like values with approval. |
| App/product registration | Portal app produces client ID/secret; the secret is shown once; the app must subscribe to each API product before tokens can be created. Production portal work starts only after customer-service confirmation. | One global client ID/secret pair; no product/version or approval metadata. | Separate secret-manager configuration per environment. Record product/version/approval outside source control. |
| User authorization | Each API call needs the software app client ID and a valid token identifying an end user authorized for the business. Digital authorization may require grant and recipient acceptance and can expire/revoke. | Routes trust a browser-supplied business number/token; no Keepintax identity binding or authorization status. | Critical security gap. SHAAM consent does not replace Keepintax authentication/tenant authorization. |
| OAuth flow/scope | OAuth2 user-restricted authorization code. Public guide describes access token, rotating single-use refresh token, refresh expiry, and consent count. Bundled/public sandbox schema uses scope `scope`. | Authorization code + Basic client auth and scope `scope`; state weak; only access/refresh/expiry captured. | Core protocol shape exists. Add state integrity, backend-only tokens, refresh rotation metadata, re-consent handling, and current portal scope confirmation. |
| Redirect URI | OAuth uses a registered application callback; exact current portal validation rules are not stated in the publicly indexed material reviewed. | One `SHAAM_REDIRECT_URI`, and token exchange enforces exact equality; callback also accepts a redundant query override. | **Portal confirmation required:** exact HTTPS URI, casing, ports, allowed multiplicity, and sandbox/production separation. |
| Sandbox invoice endpoint | July 2024 V2 beta publishes `https://ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval` as the new sandbox URL. | Uses `https://openapi.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval`; the bundled schema lists that host as an alias. | Likely stale alias. Switch only to the endpoint displayed for the subscribed current product after confirmation. |
| Production endpoint | The public July 2024 allocation spec reviewed does not provide a usable production Approval URL. The general portal process distinguishes production and requires confirmation. | Production URLs blank; selection throws. | Correctly blocked. **Portal confirmation required; do not synthesize by replacing `tsandbox` with `production`.** |
| Required V2 fields | V2 requires issuer VAT number, customer VAT number, document/reference IDs, document type, dates, software number, amounts/discount/VAT. It supports optional operator/company/customer/items/logistics fields. | DTO has the 13 required fields used by bundled V2. | Shape is close, but validation lacks official enum, bounds, and length rules; optional fields cannot be sent because whitelist strips them. |
| Document types | `305` = tax invoice; `320` = tax invoice/receipt; other published codes include `300`, `310`, `330`, `332`, `340`, etc. | Both tax invoice and tax-invoice/receipt map to `305`; default is also `305`. | Contract defect. Use explicit supported mappings and reject every unmapped type. |
| Operator/issuer identities | `vat_number` is issuer VAT number. `user_id` is the service operator ID and is conditionally required when `user_name` is absent. `accounting_software_number` is the registered software certificate number (current July 2024 English spec notes the producer entity number if no certificate). | `user_id` is issuer business number; software number hard-coded; issuer/customer have synthetic fallbacks. | Contract and production-data risk. Values must come from verified server-side records/configuration, never fallbacks. Clarify certificate/producer rule with the current portal before launch. |
| Stable invoice identifiers | Every allocation request must carry a unique `invoice_id`, and the service associates the returned number with it. Reference number represents the document number when committed. | `invoice_id` uses current timestamp and a pre-reservation counter peek; retry changes identity and reference may not equal the finally reserved document number. | Persist/reserve first, then request using an immutable server-side ID and final document reference. |
| Dates | Invoice date is the printed document date; issuance date is an automatic system date not user-editable. | Both are copied from the same editable document date in the browser. | Generate/validate issuance date server-side. |
| Amounts | Before-discount, absolute discount, net before VAT, VAT, and total including VAT are required. | Browser calculates values; backend only checks net + VAT = gross within `0.01`. | Recompute from persisted server-side lines, validate discount equation/currency/rounding, and prevent browser substitution. |
| Success/validation | V2 success is `200` with `approved=true` and a confirmation number. Validation may be `400` with structured errors and no allocation. | Models these primary fields; error adapter expects one particular `errors` placement. | Preserve upstream status/error ID/codes safely, normalize documented variants, and never retry semantic validation blindly. |
| Material delay/refusal | Official flow requires four user choices: cancel, continue without allocation with required conspicuous wording, reverse charge with the prescribed follow-up request, or hearing/review; technical errors should be corrected and retransmitted. | UI offers save/cancel-later, manual request, or issue without number. It does not implement the complete delayed-invoice decision service or required document wording/workflows. | Automatic production flow cannot launch until product/tax behavior is explicitly designed and approved. Tax/accounting decision required. |
| Manual 2026 threshold | Above NIS 10,000 before VAT from 2026-01-01; above NIS 5,000 from 2026-06-01. Manual request requires customer VAT number, invoice number, pre-VAT amount, and VAT amount. | Threshold helper matches these dates/amounts and uses strict `>`; dialog shows most relevant values. | Current threshold logic matches the official current service page. Keep it externally reviewable and date-versioned. |
| Security | Current appendix requires encrypted auth data and protected auth logs; 2FA and monitoring; penetration-test duties depend on client volume. | AES-GCM at rest is positive, but plaintext tokens traverse browser URL/JS and logs. No audit/revocation controls. | Critical noncompliance risk. Rotate exposed material; redesign before certification. |

## Validation and exact results

No external SHAAM request was made. There was no `.env` in root, backend, or frontend, so no safe preconfigured sandbox flow existed. Interactive end-user authorization could not and must not be bypassed. A live test would also have exercised code that logs/leaks tokens and lacks tenant guards.

| Check | Exact result |
|---|---|
| Base/cleanliness | `HEAD` = `4c9ad8c9405a2c3cf257074b1f499036ac0c5146` (`docs: approve SHAAM integration audit`). Worktree clean before documentation. The task dashboard still described a pending worker from an older base; the explicit delegation/base and actual HEAD agree. |
| SHAAM test discovery | `rg` found no `shaam*.spec.ts`/SHAAM test file. No SHAAM unit or integration test ran because none exists. |
| Backend dependency install | `npm ci` exit 0; 1,117 packages added. npm reported 84 dependency vulnerabilities (11 low, 36 moderate, 32 high, 5 critical) and deprecation warnings. No audit fix was run. `node_modules` is ignored and not committed. |
| Backend build | `npm run build` (`nest build`) exit 0. |
| Focused offline runtime assertions | Exit 0; 9 assertions passed: AES-GCM round trip; tamper rejection; sandbox approval URL; production refusal; random state length; state and scope in authorization URL; valid approval DTO; invalid totals rejected. Dummy non-secret values only; no network call. |
| Frontend dependency install/build | `npm ci` exit 1 before install because `package.json` and `package-lock.json` are out of sync: missing `@types/node@26.4.1` and repeated `chokidar@3.6.0` entries. npm also warned the available Node `v22.22.2` is outside the package's declared `^20.11.1`. The frontend build was not run. No lockfile repair was authorized in this documentation-only task. |
| Repository secret scan (targeted) | Confirmed a tracked SHAAM request file includes bearer-token-like and client-ID-like material. Only lengths were inspected; values are intentionally omitted. Rotation/revocation is required. |

Known pre-existing verification issues: no SHAAM tests; frontend lockfile drift; dependency vulnerability count; verbose secret/PII logging; stale manual request collections.

## Prioritized gaps and risks

### P0 — before any further sandbox use

1. Revoke/rotate every credential or token ever placed in the tracked SHAAM request artifact; determine whether Git history/remotes contain it. Remove and replace the artifact with placeholders in a separately reviewed security commit.
2. Remove full/partial token, authorization code, client ID, invoice payload, response, and generated curl logging. Treat existing collected logs as potentially sensitive and follow the incident/retention policy.
3. Put authentication and strict owner/delegation authorization on every SHAAM route. Eliminate browser access-token retrieval and browser-supplied upstream bearer tokens.
4. Validate state before code exchange; make it hashed, single-use, expiring, durable/shared across instances, and bound to Keepintax user, business, environment, redirect target, and PKCE/session where supported.

### P1 — before sandbox acceptance

1. Rebuild the flow around a server-persisted document/allocation attempt. The backend must derive business, final document number, operator, registered software number, dates, amounts, and type from authorized server data.
2. Correct `320`, remove all test fallbacks/fixed production constants, enforce official enums/ranges/lengths, and use an immutable retry-safe `invoice_id`.
3. Capture atomic refresh-token rotation and expiry/consent metadata; serialize concurrent refresh; handle revoked/expired consent by requiring reconnect; add disconnect/revoke cleanup.
4. Make environment selection explicit and fail closed. Separate sandbox/production app credentials, encryption keys, callback URIs, endpoints, product versions, and databases. Never default a deployed process silently to sandbox.
5. Normalize current portal response/error schemas. Distinguish technical retry, validation correction, lack of authorization, and substantive delay. Add idempotency and concurrency protection around approval/finalization/journal creation.
6. Replace the process-memory state map. Fix callback URL composition (`FRONTEND_URL` fallback currently includes `/my-account` before another path is appended), OAuth error propagation, retry business context, and draft return routing.
7. Fix pending-document navigation to use the document number returned by the backend. Validate allocation-number format/provenance server-side and prevent cross-business finalization.

### P2 — before production canary

1. Implement the four official delayed-invoice choices and exact required printed statements only after owner/tax-accounting approval.
2. Add structured, redacted audit events: consent connected/refreshed/revoked, allocation attempt ID, business-internal ID, outcome category, upstream correlation/error ID, document link, and actor—without tokens or unnecessary personal invoice data.
3. Add unit, controller authorization, contract, sandbox integration, restart/multi-instance, refresh race, idempotency, document rollback, and end-to-end tests. Repair the frontend lockfile on Node 20 and pass both builds.
4. Complete current security-appendix controls, including 2FA posture, encrypted/protected logs, monitoring/incident response, and any applicable penetration test.

## Reversible manual sandbox smoke test

This procedure is intentionally gated. **Do not run it against the current code.** Run only after all P0 items and the relevant P1 implementation are merged, from an isolated non-production deployment and database.

### Prerequisites and safety record

1. Tax Authority developer portal shows a dedicated sandbox organization/app subscribed to the current **Invoices v2** product. Record product/version and approval status, not secrets.
2. Confirm in the portal/support response the current sandbox authorize/token/Approval URLs, exact scope, registered callback URI rules, registered software number rule, synthetic VAT/operator identities, and expected delayed-invoice test behavior.
3. Use a dedicated sandbox client ID/secret and a dedicated encryption key from the secret manager. Confirm none appears in source, browser configuration, CI output, or logs.
4. Use a disposable test database snapshot and a synthetic Keepintax user/business. Use only Tax Authority-published sandbox identities; never real customer, issuer, invoice, email, phone, address, or payment data.
5. Enable safe structured logs and a capture checklist that records timestamps, HTTP outcome classes, internal attempt IDs, and redacted last four digits of allocation numbers only. Verify request/response bodies and headers are not captured.

### Test steps and evidence

1. Sign in as the synthetic Keepintax owner and initiate connection for its one synthetic business. Expected: redirect is HTTPS to the confirmed sandbox authorization host; `state` is opaque; no token or secret is visible. Evidence: redacted URL origin/path and internal state-attempt ID.
2. Complete the Tax Authority's interactive sandbox authorization normally. Do not automate credentials or bypass interaction. Expected: callback is accepted once and returns to the originating document page; refresh/access tokens exist only encrypted server-side; browser URL/history/storage/devtools and application logs contain none. Evidence: screenshots with identifiers redacted plus backend “connected” status metadata only.
3. Replay the callback URL and try a callback with altered state, wrong business context, expired state, signed-in second user, and after an application restart. Expected: every attempt is rejected before token exchange/save; valid shared-state behavior across the intended deployment topology is demonstrated.
4. Create and persist a synthetic above-threshold `305` tax-invoice attempt using the portal-confirmed allocation-success issuer identity, synthetic customer, current sandbox-valid dates, final reserved reference number, verified software number, and immutable `invoice_id`. Expected: server-calculated amounts match lines and no PDF/journal is finalized before allocation.
5. Submit exactly once through the authenticated backend endpoint. Expected: HTTP 200, `approved=true`, nonzero confirmation number; same business/document/attempt stores the number; PDF and journal finalize once. Evidence: redacted allocation suffix, upstream correlation/status, one document, two PDFs, one journal entry.
6. Retry the same immutable `invoice_id` after a simulated client timeout. Expected: no second Keepintax document/journal and no conflicting allocation. Confirm exact upstream replay semantics with the current portal contract; do not assume them if sandbox differs.
7. Submit invalid totals, invalid type, invalid/missing customer VAT, stale/invalid date, and unauthorized business/user. Expected: local invalid data is rejected before upstream; upstream validation/authorization errors are mapped without leaking data and do not finalize a document.
8. Use the portal-confirmed synthetic delayed-invoice issuer (the repository snapshot names `777777723`, but reconfirm it). Expected: no allocation; UI presents the four approved outcomes with correct status persistence and no automatic retry of a substantive refusal.
9. Exercise token refresh only through the supported expiry/test control. Expected: a new access token and rotating refresh token are atomically stored, old refresh material is not reused, metadata updates, concurrent requests do not race, and tokens remain absent from logs/browser.
10. Revoke the sandbox user's digital authorization in the Tax Authority personal area and call a harmless authenticated status/refresh path. Expected: reconnect-required state; no repeated refresh storm; no allocation call.

### Cleanup

1. Use the implemented disconnect operation to erase the synthetic business's encrypted access/refresh tokens and consent metadata.
2. Revoke the sandbox authorization and, if disposable, regenerate/revoke the sandbox app credentials in the developer portal.
3. Delete the isolated database or restore its pre-test snapshot; delete only test PDFs/storage objects identified by the recorded internal attempt IDs.
4. Delete local screenshots/traces containing identifiers after extracting the redacted pass/fail record. Verify `git status` contains no `.env`, logs, build output, tokens, test data, screenshots, or dependencies.
5. Retain only the approved redacted test report and defect list. A failed cleanup step is a release blocker.

## Shortest staged path to one real production allocation number

### Stage 0 — immediate containment (security owner; approval to rotate/revoke)

Rotate/revoke the tracked credential-like material, sanitize the repository/history according to the team's incident decision, and purge unsafe logs. Automatic allocation stays disabled. Gate: security owner confirms no active exposed credential remains.

### Stage 1 — Tax Authority onboarding (business owner; can run in parallel)

1. Confirm Keepintax's legal software producer entity and whether its accounting-document software registration/certificate is current.
2. Complete corporate/super-authorized registration and digital authorization for the person operating the developer portal, including recipient acceptance.
3. Create sandbox and production developer-portal requests/apps; sign and submit the API undertaking and current information-security appendix.
4. Subscribe the app to the current Invoices product in sandbox. Obtain the product-issued client ID/secret securely.
5. Complete Tax Authority support/certification/pilot requirements and receive explicit production portal/product activation.
6. Obtain written/current portal confirmation of production authorize/token/Approval URLs, scope, callback, headers, software number, response schema, limits, and support/escalation process.

Gate: Tax Authority onboarding evidence is complete. No credentials are pasted into chat, tickets, Git, or documentation.

### Stage 2 — code and configuration remediation (engineering; normal reviewed delivery)

Implement P0/P1: authenticated owner-scoped backend-only OAuth and approval, durable state, redacted logs, secret-manager configuration, correct/stable server-derived V2 request, refresh rotation/revocation, allocation-attempt persistence/idempotency, current contract errors, pending-document number fix, and safe disconnect. Keep production switch impossible by default.

Gate: security review, focused tests, backend/frontend builds, and no-secret scan pass.

### Stage 3 — sandbox acceptance (owner + engineering)

Run the complete manual smoke test above, plus automated contract/authorization/restart/concurrency tests. Resolve every changed-code failure. Have the owner/tax adviser approve the substantive-delay four-choice behavior and printed wording.

Gate: signed redacted sandbox report, applicable security controls/PT, and Tax Authority production activation all pass.

### Stage 4 — production configuration (operations; explicit approval required)

Create production-only secrets and encryption key in the production secret manager; use exact portal-issued endpoints/scope/callback/product data; enable only for one allowlisted internal/owner business. Deploying/restarting production and handling real credentials require explicit approval and are outside this audit.

Gate: two-person configuration review, backup/rollback plan, monitoring, support window, and owner authorization for the canary business.

### Stage 5 — one real allocation (authorized user + operations; explicit production-call approval)

An authorized business user performs interactive production consent and issues one genuine eligible invoice through the guarded canary. The server reserves the final document identity, submits once, stores the returned allocation atomically, finalizes the document once, and the user verifies the printed allocation and Tax Authority record. Do not use fabricated production data and do not retry ambiguously without idempotency evidence.

Gate: reconcile Keepintax document/PDF/journal with the Tax Authority result, review redacted logs, then explicitly decide whether to roll back, remain canary-only, or expand.

## Production go/no-go checklist

Every item must be **yes** for a production canary:

- [ ] Tracked credential-like material was revoked/rotated; repository/history/log exposure was handled and documented.
- [ ] Keepintax software registration/certificate rule and actual software number were verified with the current Tax Authority contract.
- [ ] Software-house digital registration, undertaking, security appendix, sandbox request, production request, product subscription, and customer-service activation are complete.
- [ ] Exact production endpoints, scope, callback URI, headers, limits, and schema came from the active portal/product—not inference.
- [ ] Sandbox and production credentials/keys/config are isolated in a secret manager; production cannot fall back to sandbox or dummy identifiers.
- [ ] All SHAAM routes authenticate and enforce owner/delegation policy; cross-user/business negative tests pass.
- [ ] OAuth state is durable, single-use, expiring, user/business/environment-bound, and replay/restart/multi-instance tested.
- [ ] Tokens never enter browser URLs/storage/JavaScript, Git, logs, errors, traces, analytics, or support artifacts.
- [ ] Refresh-token rotation, expiry, consent counters, concurrency, revocation, and reconnect are tested.
- [ ] Request data is server-derived from a persisted final document identity; `305`/`320`, operator identity, software number, dates, amounts, and retry ID are contract-correct.
- [ ] Success, validation, authorization, technical failure, timeout/unknown outcome, and substantive delay are distinct and idempotent.
- [ ] The four delayed-invoice choices and required printed wording have explicit owner/tax-accounting approval.
- [ ] Allocation finalization cannot create duplicate PDFs/journals or target another user's document; rollback/recovery is tested.
- [ ] SHAAM unit/controller/contract/integration/E2E suites pass; Nest and Angular builds pass on supported runtimes.
- [ ] Current security appendix controls, monitoring, incident response, encrypted audit-log handling, and applicable penetration testing are complete.
- [ ] Full sandbox smoke test and cleanup pass with only synthetic data and a redacted evidence report.
- [ ] Production deployment/restart, real credentials, real business consent, and the single canary call each have explicit approval.
- [ ] Rollback, Tax Authority support contact, reconciliation, and post-canary review owners are scheduled.

Current answer: **NO-GO**. The manual Tax Authority link/paste/finalize flow may remain the user-facing path, subject to its existing authorization and document-number defects being addressed in ordinary product work; it is not evidence that the automatic SHAAM API is production-ready.
