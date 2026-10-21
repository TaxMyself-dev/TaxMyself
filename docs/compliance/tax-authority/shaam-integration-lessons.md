# SHAAM integration lessons and operational invariants

Last updated: 2026-10-21.

This document records engineering conclusions learned while implementing and
operating the Keepintax SHAAM integrations. It is not a substitute for the
current Tax Authority portal contract, formal onboarding material, or legal and
tax advice. Reconfirm changing endpoints, scopes, effective dates and product
activation before every production rollout.

## Evidence levels used here

- **Code-verified**: enforced by the current repository and focused tests.
- **Environment-verified**: observed end to end in Keepintax dev/tsandbox or
  production and reconciled with database state.
- **Tax Authority communication**: supplied by Elazar from a Tax Authority
  email or support conversation. Preserve the original communication outside
  Git and reconfirm it when a portal contract conflicts.
- **Open confirmation**: must not be guessed or treated as production truth.

## Scope is part of the customer grant

Tax Authority support clarified on 2026-10-21 that an OAuth scope describes
the customer's authorization represented by the token. It is not the same as
the application's API-product subscriptions in the developer portal. Both are
required:

1. Keepintax's portal application must be subscribed and activated for the API
   product.
2. The customer grant/token must include the scope required by that API.

The Tax Authority email supplied on 2026-10-21 announced that, from
2026-11-01, listed invoice APIs move from the historical `scope` value to
`invoices_scope`. Treat the effective date and API list as external operational
evidence and recheck the active portal before a later rollout.

### Long Time Token scope rules

- Keepintax has one cumulative environment variable for APIs sharing the Long
  Time Token grant:

  ```env
  SHAAM_SCOPES=invoices_scope
  ```

- When another compatible API is added, configure the complete desired grant,
  not only the newly added scope:

  ```env
  SHAAM_SCOPES=invoices_scope,new_service_scope
  ```

- Tax Authority support stated that multiple scopes must be comma-delimited.
- The exact same normalized cumulative value must be sent in all three OAuth
  operations: authorization request, authorization-code exchange and refresh.
- Refresh does not upgrade an old customer grant. If the configured scope set
  grows, a customer whose stored grant lacks a required scope must complete a
  fresh interactive authorization.
- Never change `shaam_connection.scopes` manually to make a grant appear
  broader. That column records what the provider granted. A missing scope must
  produce `REAUTH_REQUIRED` and a reconnect.
- `SHAAM_SCOPES` is mandatory in production and must be configured before the
  corresponding backend deployment. The application deliberately fails closed
  when it is absent.
- Changing only the variable does not require a database schema or data
  migration. Existing `invoices_scope` grants remain valid while grants that
  are null, historical or incomplete require reconnection.

These rules are code-verified by the cumulative-scope implementation and its
tests. The successful production authorization and allocation issuance on
2026-10-21 are environment evidence for the current single `invoices_scope`
flow.

## Long Time Token lifecycle

- Access and refresh tokens stay on the backend, encrypted at rest, and are
  never returned to browser JavaScript, URLs or normal API responses.
- OAuth state is durable, hashed, single-use, expires and is bound to actor,
  business, product and environment before code exchange.
- An expired access token is normally refreshed server-side; it is not by
  itself a reason to send the customer through authorization again.
- A successful refresh may rotate the refresh token. Save the new token
  atomically; if the provider omits a replacement, preserve the current one.
- Provider responses such as `invalid_grant`, `invalid_token` or
  `invalid_scope` require fresh authorization. Network timeouts, provider 5xx
  responses and local configuration errors must not silently destroy a valid
  grant.
- Dev/tsandbox refresh was environment-verified on 2026-10-21: the provider
  returned a four-hour access token and rotated the refresh token.

## Reconnect and callback context

- Settings must offer an explicit reconnect action that starts a completely
  new authorization using the currently configured complete scope set. It does
  not need to revoke the old grant first.
- The OAuth callback must preserve where the flow started. A connection started
  in Settings must not display “continue document issuance”; a flow started
  during document issuance may return there.
- If production still shows the wrong callback action after the source fix,
  first verify frontend deployment revision and browser/cache state rather than
  changing the OAuth contract again.

## Invoice allocation request safety

- Build the provider payload on the server from the persisted document and
  business. Do not accept totals, dates, issuer/customer VAT numbers,
  `invoice_reference_number` or provider `INVOICE_ID` from the browser.
- Persist a `PROCESSING` allocation attempt before the provider call.
- Provider success and the allocation number must be stored atomically before
  PDF/journal finalization.
- A stored allocation number makes a retry finalize the same document without
  another provider approval call.
- The verified production issuance on 2026-10-21 produced document `30199`,
  received HTTP 200, saved one allocation number, finalized original/copy PDFs
  and recorded exactly one `APPROVED` attempt.

## Ambiguous outcomes and recovery

- A timeout, connection loss, malformed success or expired processing lease can
  mean that the Tax Authority accepted the request even though Keepintax did not
  receive a usable response. Such an attempt enters `UNKNOWN_OUTCOME`.
- Never automatically submit another approval request from
  `UNKNOWN_OUTCOME`/`IN_FLIGHT`. First reconcile using persisted evidence and
  the official recovery/status facility.
- Invoice recovery uses the v2 Invoice Information confirmation-number
  endpoint and validates the returned allocation through v2 details against
  the persisted document identity and totals before saving it.
- An ambiguous recovery failure blocks a replacement approval. A controlled
  admin resolution may mark the attempt safe to retry only with evidence that
  the original was not accepted, or record a confirmed allocation manually.
- HTTP 406 alone is not proof that a new approval should be sent. Classify
  authorization, permission, request-shape and provider errors without blind
  replay.

## Sandbox and production are different evidence

- A sandbox happy path proves connectivity and request compatibility only; it
  does not prove production authorization, business rules or certification.
- Invoice allocation in tsandbox is restricted in code to the Tax Authority
  test issuer `777777715` unless an explicitly approved allowlist is configured.
- The tsandbox allocation-details endpoint can return a fixed fixture. Fixture
  mismatches must not be mistaken for a recovered real allocation.
- Production endpoint configuration fails closed and uses exact approved v2
  paths for confirmation recovery and allocation details.
- Never infer production URLs, products, callbacks or credentials from sandbox
  naming. Confirm them in the authenticated portal/support channel.

## Safe observability

- Log operation, stage/outcome, environment, gateway host, HTTP status,
  duration, bounded failure category/reason, token-rotation boolean and internal
  attempt/request identifiers only where those identifiers are approved.
- Never log tokens, authorization codes, client secrets, signed upload URLs,
  upload session URLs, raw provider bodies/messages, business/customer numbers,
  invoice references, allocation numbers, dates or monetary values.
- Refresh lifecycle logs use enabled levels: `debug` for start/success, `warn`
  for reauthorization and `error` for transient/configuration failure.
- Known follow-up: successful low-level invoice API events currently use Nest
  `logger.log`, while the production logger configuration observed during the
  rollout did not enable the `log` level. Failure events were visible but
  success events were not. Resolve this as a focused observability task rather
  than adding sensitive ad-hoc output.

## Uniform File API is a separate OAuth product

The Uniform File integration must not use `SHAAM_SCOPES` or the invoice Long
Time Token:

- It uses a product-specific Daily Token with a maximum 12-hour lifetime.
- It has two product scopes: `UniStructFileUploadLinksApi` and
  `FilesStatusApi`.
- It has no refresh-token flow. Expiry requires another interactive Daily Token
  authorization.
- It has separate `SHAAM_UNIFORM_FILE_*` configuration and remains disabled by
  default; production has an additional explicit kill switch.
- Tokens, signed upload links and resumable-upload session URLs remain
  server-side and are treated as secrets.

### Open scope-delimiter confirmation

The existing Daily Token client serializes its two scopes with a space, based
on the earlier uniform-file material. The later support guidance says multiple
scopes are comma-delimited. Before enabling the Uniform File OAuth flow, obtain
current product-specific confirmation for the Daily Token authorize and token
requests, then use the same confirmed serialization in both operations. Do not
assume that the Long Time Token rule automatically overrides a product-specific
Daily Token contract.

## Uniform File implementation status on 2026-10-21

Completed:

- generation and strict validation of Windows-1255 `INI.TXT` and
  `BKMVDATA.TXT` buffers, with ZIP download fallback;
- separate Daily Token configuration/client and exact product scopes;
- authenticated, business-scoped OAuth initiation/callback infrastructure;
- product-aware connection/state persistence;
- `uniform_file_submission` entity and controlled DDL with hashes, sizes,
  pair/file IDs and states but no file bytes or capability URLs.

Not completed:

- upload-link reservation client and response validation;
- resumable Google upload initiation and chunked upload of both files;
- remote file-status polling and pair reconciliation;
- restart-safe orchestration, retry/unknown-outcome behavior and submission
  APIs;
- frontend connect/submit/status experience;
- controlled sandbox acceptance and production activation.

Production must remain disabled until these items, the current portal contract,
the Daily Token delimiter, product subscriptions/callbacks and one authorized
canary demand are verified.

## Deployment discipline

- A Git push is not a production deployment.
- Configure required production environment variables before deploying code
  that fails closed on them.
- Apply only explicitly reviewed schema DDL; do not rely on TypeORM
  synchronization.
- Do not rewrite database grant metadata to bypass OAuth.
- Run dev/tsandbox acceptance first, reconcile database state and safe logs,
  then use an explicitly approved production canary. Never fabricate production
  taxpayer data or automatically retry an ambiguous external write.
