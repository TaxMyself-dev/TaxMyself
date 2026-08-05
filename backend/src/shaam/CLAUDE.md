## Purpose
Integrates with the Israel Tax Authority's SHAAM OpenAPI — OAuth2 authorization per business and invoice-approval ("חשבונית מס" allocation number) submission.

## Key entities/files
- `shaam.controller.ts` — `ShaamController`: OAuth redirect/callback (state map with 10-minute TTL, businessNumber-keyed), access-token retrieval with automatic refresh, invoice-approval submission. Persists encrypted tokens onto the `Business` entity.
- `services/shaam-oauth.service.ts` — `ShaamOauthService`: builds the authorize URL, exchanges an auth code for tokens, refreshes tokens. Requires `SHAAM_CLIENT_ID`/`SHAAM_CLIENT_SECRET`/`SHAAM_REDIRECT_URI` env vars (throws at construction if missing).
- `services/shaam-invoices.service.ts` — `ShaamInvoicesService.submitApproval`: validates `payment_amount + vat_amount == payment_amount_including_vat` then calls SHAAM's Invoices Approval endpoint.
- `shaam.constants.ts` — environment URL map; only `tsandbox` is configured, `production` throws.
- `utils/shaam-encryption.util.ts` — `encryptToken`/`decryptToken` used before persisting tokens on `Business`.
- `dto/shaam-*.dto.ts` — OAuth token response, approval request/response shapes.

## Main flows
- `GET /shaam/oauth/redirect` → `GET /shaam/oauth/callback` — OAuth2 authorization-code flow; on success, encrypted access/refresh tokens are saved on the matching `Business` row and the browser is redirected back to the frontend callback page.
- `GET /shaam/access-token?businessNumber=...` — returns a valid access token for a business, transparently refreshing via the stored refresh token if expired (5-minute buffer).
- `POST /shaam/invoices/approval` — submits an invoice approval to SHAAM using a bearer access token, returns the confirmation/allocation number.

## Related topics
Depends on: business (`Business` entity/service — token storage and lookup by businessNumber). Not currently injected into any other backend topic — a standalone integration not yet wired into the documents/invoices flow.
