# KT-090 - Complete the SHAAM Uniform File API

- Status: `APPROVED`
- Task manager: next Codex chat
- Worker: unassigned
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `c1b34918ce73b41e64f726460b57f4aeaafe255e` plus this documentation commit

## Business outcome

An authorized Keepintax user can generate the validated Uniform File pair,
obtain the Tax Authority Daily Token, submit both files safely, follow their
remote processing status and retain the ZIP download fallback without exposing
tokens or upload capabilities to the browser.

## Acceptance criteria

- [ ] Reconfirm the active portal/support contract for Daily Token authorize
      and token URLs, delimiter for the two scopes, callback, subscriptions and
      sandbox identities before enabling external calls.
- [ ] Reserve upload links with the documented case/period/representative
      request and strictly validate the returned pair, file names, IDs, headers
      and size limits.
- [ ] Initiate and complete server-side resumable uploads for the exact
      Windows-1255 INI/BKM buffers, including documented chunk tiers and HTTP
      201/308/200 handling.
- [ ] Poll both file IDs and distinguish `Uploaded`, `Approved`, `Rejected` and
      not-found/permission outcomes; the pair is approved only when both files
      are approved.
- [ ] Persist state before every external boundary and implement idempotent,
      restart-safe recovery. Never request a second link pair after an
      ambiguous outcome without reconciling saved file IDs.
- [ ] Expose only authenticated, owner/delegate-scoped submission/status APIs;
      never return Daily Tokens, signed URLs or upload-session URLs.
- [ ] Add frontend connection, submission and status UX while retaining the ZIP
      download fallback and never displaying `Uploaded` as `Approved`.
- [ ] Add focused client/orchestrator/controller/frontend tests for success,
      partial pair, rejection, authorization errors, timeouts, restart,
      concurrency and unknown outcomes.
- [ ] Run controlled tsandbox acceptance with synthetic/official test data and
      retain only redacted evidence.
- [ ] Keep production disabled until explicit activation approval, verified
      production configuration, a real inspector demand and an authorized
      canary business are available.

## Scope and constraints

- In scope: remaining Uniform File Daily Token, upload, polling, persistence,
  API, UI, tests and sandbox acceptance work.
- Out of scope without separate explicit approval: production deployment,
  production schema execution, real taxpayer submission, credential handling
  in chat/Git, and changes to invoice-allocation Long Time Token behavior.
- Required reading:
  - `AGENTS.md`
  - `docs/coordination/WORKFLOW.md`
  - `backend/src/shaam/AGENTS.md`
  - `backend/src/reports/AGENTS.md`
  - `frontend/src/app/pages/uniform-file/AGENTS.md`
  - `docs/tasks/active/KT-061-uniform-file-api-contract.md`
  - `docs/tasks/active/KT-062-uniform-file-oauth-boundary.md`
  - `docs/tasks/active/KT-063-shaam-unified-connections.md`
  - `docs/compliance/tax-authority/shaam-integration-lessons.md`
- Approval boundaries: do not call production, deploy, mutate production data
  or enable the production kill switch. Interactive authorization remains a
  user action.

## Current implementation boundary

- Generator/validator: `backend/src/reports/reports.service.ts` and
  `backend/src/reports/uniform-file-validator.ts` already produce the exact
  separate buffers needed by an uploader.
- OAuth: `backend/src/shaam/uniform-file/` implements the disabled-by-default
  Daily Token foundation. It currently joins scopes with spaces; this is an
  open contract confirmation after the newer comma-delimiter guidance.
- Security/state: `ShaamSecureController`, `ShaamOauthStateService` and
  `ShaamConnectionService` provide authenticated product-aware infrastructure.
- Persistence: `UniformFileSubmission` exists, but no upload orchestrator uses
  it yet. Repository docs say its DDL was applied to dev; verify actual dev and
  production schemas before planning any migration. Do not infer production
  state from the entity.
- Frontend: `/uniform-file` only generates summaries and downloads
  `openformat.zip`; it has no SHAAM submission/status flow.

## Handoff

- Result: implementation task prepared for a fresh chat; no Uniform File code,
  schema, environment or external service was changed here.
- Commit hash(es): local documentation commit (see Git history; not yet pushed).
- Changed files: this task and the SHAAM lessons document/topic index.
- Tests and exact results: documentation-only; no new runtime tests required.
- Schema / production / security / accounting / external impact: none.
- Risks and manual checks: confirm Daily Token scope delimiter and portal
  contract before writing/enabling external-call code.
- Documentation updated: SHAAM engineering lessons and compliance topic map.
