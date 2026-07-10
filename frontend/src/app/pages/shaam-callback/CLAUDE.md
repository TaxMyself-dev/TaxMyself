## Purpose
OAuth redirect-landing page for the SHAAM (Israel Tax Authority) integration: receives the authorization result from the SHAAM (or backend-proxied) redirect and completes the token exchange.

## Key entities/files
- `shaam-callback.page.ts` — `ShaamCallbackPage` (standalone). Reads query params (`code`/`state`, or a pre-built `response`, or `error`/`error_description`); either parses a full token response directly or calls `ShaamService.exchangeCodeForToken(code, state)`.
- `shaam-callback.page.html` / `.scss` — loading / success / error states with retry and navigate-away actions.
- `shaam-callback.module.ts` — trivial routing module (no declarations array needed; page is standalone).

## Main flows
- Success via direct response: decode `response` query param → JSON-parse into `ShaamTokenResponse` → `handleTokenReceived` (clears legacy localStorage SHAAM tokens, shows success toast).
- Success via code exchange: `code` + `state` present → `ShaamService.exchangeCodeForToken` → same `handleTokenReceived` completion.
- Error path: `error`/`error_description` present, or code/state missing, or JSON parse fails → sets `isError` and shows a toast.
- Post-landing actions: `navigateToHome` (`/my-account`), `navigateToDocCreate` (gated via `AccessHandlerService.handleFeatureAccess(AppFeature.DOC_CREATE_BUTTON_PIVOT)`), `tryAgain` (re-initiates OAuth via `ShaamService.initiateOAuthFlow`).

## Related topics
- Backend: shaam (OAuth token exchange endpoint).
- Frontend pages: doc-create (post-connect redirect target, access-gated).
- Frontend shared: none directly; uses shared `ButtonComponent` and `AccessHandlerService`/`AppFeature` from access-control.
