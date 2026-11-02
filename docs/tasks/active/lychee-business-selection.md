# Lychee business selection — first incremental checkpoint

Delivery follow-up is implemented locally; see lychee-business-question-outbox.md
in this directory and the question-delivery feature document for current status.

- Status: MANAGER_REVIEW (incremental preview/routing checkpoint only)
- Worktree: TaxMyself-whatsapp; branch: codex/whatsapp-integration.
- User chose incremental implementation. Start with business selection and dev
  reply routing; defer success/failure notifications to the next stage.
- No real messages, deployment, push, schema changes or live SQL writes.

## Implemented scope

- Pure vendor-compatible question preview quoting the original document.
- Snapshot short, unique business labels with business numbers and full names.
- Up to three buttons; larger lists use a quoted numbered text menu.
- Normal intake still only stages bytes in WAITING_FOR_BUSINESS. Log a safe
  preview marker/count, without exposing business names/phone or assigning fake IDs.
- No HTTP send transport exists at this checkpoint. A real question ID must
  come from the future authorized sender before recordPrompt is called.
- Offline tests simulate two questions answered in reverse order, reject wrong
  owner/labels, and keep each document's selected business independent.
- Proxy reads development prompt ownership directly from existing dev SQL. A
  known dev question returns to dev even after ending tests. Unknown quoted
  replies in active test mode return 409 without probing a production backend.
- Production-mode unknown replies still use the existing production resolver;
  duplicate development mappings and SQL failures fail closed.

## Remaining within business selection

- Durable outgoing-question delivery/recovery, provider idempotency behavior,
  real send transport, recording real question IDs and live end-to-end validation
  require a later explicitly authorized sending stage. No fake IDs in real SQL.
- Success/failure confirmations are deliberately not implemented in this stage.
- No merge into main; this checkpoint remains on the feature branch.

## Verification

- Focused backend: 5 suites, 34 tests passed. Proxy: 36 tests passed.
- Final Nest build passed. Diff whitespace/full source review passed.
- No real provider/Drive/database calls, fake IDs in real storage, or schema changes.
- Local feature-branch commit only; no main integration, deployment or push.
