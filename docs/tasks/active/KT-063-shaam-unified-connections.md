# KT-063 - Unified SHAAM connections and uniform-file submissions

- Status: `COMPLETE`
- Approved by Elazar: 2026-10-13
- Approval includes: 3C schema work and replacing the old browser-token invoice
  allocation path with the same server-only infrastructure used for uniform
  files.
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- No commit, push, live SHAAM request, production access or schema execution.

## Acceptance criteria

1. One product-aware connection model supports `INVOICE_ALLOCATION` and
   `UNIFORM_FILE`, separated by environment and business.
2. Access/refresh tokens are encrypted at rest and never returned to browser
   code, query strings, logs or normal API responses.
3. OAuth state is durable, hashed, single-use, expires after ten minutes and is
   bound to actor, business, product and environment.
4. Every browser-initiated route is Firebase-authenticated and scopes the
   selected business through the effective owner/delegation identity.
5. The callback consumes state before exchanging the code and stores the token
   against the state-bound business/product only.
6. Invoice allocation obtains its token server-side; the browser no longer
   submits a bearer token or calls an access-token endpoint.
7. Uniform-file submission metadata has dedicated persistence with pair-level
   state, hashes, sizes and SHAAM identifiers, but no file bytes, OAuth tokens,
   signed URLs or upload-session URLs.
8. The historical `business.shaam*` columns and process-local state map are
   removed from code and from the controlled cutover DDL. Existing sandbox
   connections must reconnect; there is no production token migration.
9. Production remains disabled by explicit configuration and no test calls an
   external SHAAM endpoint.
10. Focused backend/frontend tests and both builds pass. Commit and push were
    approved by Elazar on 2026-10-15; deployment remains separately gated.

## Schema

- `shaam_connection`
- `shaam_oauth_state`
- `uniform_file_submission`
- Drop legacy encrypted token columns from `business` only after the new code
  no longer references them.

All DDL is appended to `docs/redesign/cutover.sql`. The scoped migration was
approved and applied to `keepintax-dev`; production execution is not approved.

## Result and verification

- Applied the scoped migration to `keepintax-dev` only: all three tables were
  created. The three legacy `business.shaam*` columns were initially removed,
  then restored empty and nullable on 2026-10-14 to keep an older active branch
  working against the shared database. KT-064 blocks push until every developer
  is on the new code and the columns are removed again. No production-like
  database is accepted by the migration.
- Historical sandbox connections intentionally require reconnect.
- SHAAM focused tests: 21 passed across 5 suites.
- Backend Nest build passed.
- Angular production build passed; only pre-existing style/bundle/CommonJS
  budget warnings were emitted.
- No external SHAAM request was made during implementation; commit and push were
  approved separately by Elazar on 2026-10-15.
