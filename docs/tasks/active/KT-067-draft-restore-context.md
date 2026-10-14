# KT-067 — Isolate draft restore context between viewed businesses

Status: COMPLETE

## Goal

Ensure the document-creation page restores a draft for the business currently
being viewed, even when the browser tab still contains allocation-flow context
from a previously viewed business.

## Changes

- Treat `draft_businessNumber` as valid only when it belongs to the effective
  user's currently available businesses.
- Clear stale draft business/type session keys instead of querying another
  business.
- Treat a saved/selected document type as a preference and fall back through
  all draft-capable document types when no matching draft exists.

## Verification

- [x] Angular production build
- [ ] Manual: admin enters the SHAAM allocation demo and its seeded tax-invoice
  draft is restored automatically.

## Constraints

- Commit and push approved by Elazar on 2026-10-15; deployment remains a
  separate owner-approved action.
