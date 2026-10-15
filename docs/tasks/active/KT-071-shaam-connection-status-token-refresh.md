# KT-071 — SHAAM connection-status token refresh

Status: COMPLETE

## Approval

Elazar approved the fix on 2026-10-14. No production call, deployment, commit
or push is approved by this task.

## Goal

Prevent the document flow from requesting a new Tax Authority authorization
when only the short-lived invoice-allocation access token expired and the
server still holds a usable refresh token.

## Acceptance criteria

- `GET /shaam/connection-status` refreshes an expired invoice-allocation access
  token before reporting connection state.
- A successful refresh reports `connected: true` without returning either token.
- A missing refresh token reports `connected: false` and requires reauthorization.
- Uniform-file Daily Tokens retain their separate no-refresh behavior.

## Verification

- [x] Focused connection-service tests
- [x] Focused SHAAM allocation tests (3 suites, 14 tests passed)
- [x] Backend build
- [ ] Manual tsandbox check after restarting the backend

## Constraints

- No production SHAAM calls.
- No credentials or tokens in logs, responses, source files or chat.
- Commit and push approved by Elazar on 2026-10-15; deployment remains a
  separate owner-approved action.
