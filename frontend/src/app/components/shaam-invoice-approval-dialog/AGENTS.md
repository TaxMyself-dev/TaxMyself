## Purpose

Current manually opened dialog for requesting a SHAAM invoice allocation
number.

## Key entities/files

- `shaam-invoice-approval-dialog.component.ts` validates invoice totals, obtains
  an access token through `ShaamService`, submits the allocation request and
  displays the response.

## Main flows

- Business context must come from the authenticated active business.
- Do not log or expose tokens, client credentials or complete authorization
  requests.
- This flow has known security and lifecycle gaps. Read
  `docs/research/shaam-integration-audit.md` before any change and do not use
  production SHAAM without explicit authorization and completed go/no-go gates.

## Related topics

- `backend/src/shaam/AGENTS.md`
- `frontend/src/app/pages/doc-create/AGENTS.md`
- `docs/research/shaam-integration-audit.md`
