# KT-089 - SHAAM cumulative long-token scopes

- Status: `COMPLETE_LOCAL`
- Task manager: Codex
- Worker: Codex
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `4dc1306d208fe2bed3ab4a7a973701c5f9f7a227`

## Business outcome

Keepintax can add another Tax Authority API that shares the long-time-token
grant without silently using a customer authorization that lacks the new
scope. A reconnect requests the cumulative scope set in one comma-delimited
authorization.

## Acceptance criteria

- [x] Long-time-token scopes are normalized, deduplicated and serialized with commas.
- [x] Authorization, code exchange and refresh use the identical cumulative scope value.
- [x] Existing connections are checked against every currently required scope before token use or refresh.
- [x] A missing scope changes the connection to `REAUTH_REQUIRED` without making a provider call.
- [x] A newly returned partial grant is not reported as a successful connection.
- [x] One mandatory production variable, `SHAAM_SCOPES`, defines the complete cumulative grant.
- [x] Uniform-file Daily Token scopes remain isolated from this flow.
- [x] All SHAAM tests and the backend build pass.

## Scope and constraints

- In scope: cumulative long-time-token scope configuration, grant validation, callback outcome, tests and topic documentation.
- Out of scope: adding a second live Tax Authority API, changing the Uniform File flow, schema changes, production configuration or deployment.
- No server process, production access or external Tax Authority call was used.

## Handoff

- Result: `SHAAM_SCOPES=invoices_scope,new_scope` becomes the complete desired grant. Existing grants missing `new_scope` require browser authorization; all three OAuth stages send the same comma-delimited value.
- Commit hash: local task commit (see Git history; not yet pushed).
- Changed files: SHAAM constants, OAuth/connection services, callback controller, focused tests, SHAAM topic documentation and this task file.
- Verification: all 10 SHAAM suites/63 tests passed; Nest build passed; `git diff --check` passed.
- Schema / production / security / accounting / external impact: no schema/accounting/provider/deployment action. Tokens remain server-side and are never logged or returned to the browser.
- Deployment blocker: define `SHAAM_SCOPES=invoices_scope` in the production backend before deploying this code. The application deliberately fails closed in production when it is absent. When another scope is added later, update this single comma-delimited value before deployment and expect existing grants missing the new scope to require reconnection.
