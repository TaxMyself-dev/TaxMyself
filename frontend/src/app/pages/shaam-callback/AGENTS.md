## Purpose
Safe OAuth result page. The backend has already exchanged and stored the token; this page receives only success/error metadata.

## Key entities/files
- `shaam-callback.page.ts` — reads `connected=true` or safe error parameters. It never reads an authorization code or token.
- `shaam-callback.page.html` / `.scss` — loading / success / error states with retry and navigate-away actions.
- `shaam-callback.module.ts` — trivial routing module (no declarations array needed; page is standalone).

## Main flows
- Success: `connected=true` clears any historical localStorage values and shows success.
- Error/missing result: safe error state; no provider response body is exposed.
- Retry returns home, where a business-scoped authenticated flow can be started.

## Related topics
- Backend: shaam (OAuth token exchange endpoint).
- Frontend pages: doc-create (post-connect redirect target, access-gated).
- Frontend shared: none directly; uses shared `ButtonComponent` and `AccessHandlerService`/`AppFeature` from access-control.
