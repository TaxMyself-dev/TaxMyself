# KT-062 - Uniform-file OAuth security boundary

- Status: `COMPLETE`
- Task manager/worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- No commit, push, schema mutation or external SHAAM request is permitted.

## Outcome

Create a product-specific, server-only OAuth foundation for the uniform-file
APIs without reusing or overwriting the invoice-allocation Long Time Token.

## Implemented boundary

- The integration is disabled unless `SHAAM_UNIFORM_FILE_ENABLED=true`.
- Production additionally requires
  `SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED=true`.
- OAuth endpoints are supplied explicitly and accepted only under
  `https://openapi.taxes.gov.il`; no production URL is guessed.
- The only scopes are `UniStructFileUploadLinksApi` and `FilesStatusApi`.
- The authorization callback URI is fixed by server configuration and cannot
  be overridden by a request.
- OAuth `state` is a ten-minute HMAC-signed envelope bound to the authenticated
  actor, business number and uniform-file product. It needs no process-local
  map and reveals neither identifier as plain text.
- The Daily Token client has no refresh-token flow, validates a maximum
  12-hour lifetime and rejects a response missing either required scope.
- Upstream OAuth error bodies, tokens, authorization codes and client secrets
  are not logged or returned by this client.
- Existing allocation-number service logging was reduced: bearer-token
  fragments, token length, full curl commands and full upstream bodies were
  removed.

## Deliberately not implemented yet

- No public controller route starts the new OAuth flow.
- No Daily Token is persisted. The existing `business.shaam*` columns belong
  to the allocation-number prototype and must not be reused because the two
  products have different token semantics.
- No upload-links, resumable upload or status request exists yet.
- The legacy allocation controller still has its historical browser-token
  contract. It is not used by the new uniform-file client and remains a
  production blocker until its separate migration is completed.

The next implementation boundary is KT-063: approve and add dedicated
uniform-file submission/token persistence, then expose authenticated
owner/delegate routes that never return a token to the browser.

## Environment contract (names only)

- `SHAAM_UNIFORM_FILE_ENABLED`
- `SHAAM_UNIFORM_FILE_ENV`
- `SHAAM_UNIFORM_FILE_CLIENT_ID`
- `SHAAM_UNIFORM_FILE_CLIENT_SECRET`
- `SHAAM_UNIFORM_FILE_REDIRECT_URI`
- `SHAAM_UNIFORM_FILE_AUTHORIZE_URL`
- `SHAAM_UNIFORM_FILE_TOKEN_URL`
- `SHAAM_UNIFORM_FILE_STATE_SECRET`
- `SHAAM_UNIFORM_FILE_PRODUCTION_ENABLED`

No value was added to or read from `backend/.env` during this task.

## Verification

- 13 focused Jest tests passed:
  - disabled/missing/invalid/production configuration;
  - exact scopes and fixed callback;
  - signed-state round-trip, tamper rejection and expiry;
  - Daily Token exchange, response validation, safe error normalization and
    disabled-mode zero-call behavior.
- Backend Nest build passed.
- No live network request was made.
