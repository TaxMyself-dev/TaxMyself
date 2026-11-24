# Durable Gmail intake

Owns persisted scan/work state. Pull, processing and confirmed-negative deletion are always available; no runtime feature switches or test-subject override. The reviewed schema must be present before starting this release. Schema preparation is not schema authorization. All claims, decisions and tombstones are owner/business scoped; never use attachment IDs as content identity. Only a complete explicit negative permits an exact-file deletion, after ownership/reference/race checks. Unknown AI outcomes are never replayed blindly. Do not start Nest, connect live databases, run imports/AI or delete files during development. No main integration, push or deploy.


## Outlook through Composio

Settings now supports Microsoft Outlook alongside Gmail. OAuth state is provider-bound;
the backend validates managed auth config, toolkit, owner, active account and identity.
Read tools are allowlisted separately per toolkit. The persisted provider selects the
reader; date windows, durable runs, owner restrictions and content-hash dedup are shared.
Historical GMAIL source/metadata names identify this shared email pipeline internally.
See `docs/features/outlook-email.md` for configuration and the verified DEV-only schema and pending live OAuth verification.
## Shared DEV worker routing

User-authorized email routing is separate from feature availability. Optional
EMAIL_WORKER_SCOPE=local/test tags runs and filters both scan and downstream claims;
unset preserves production SQL and does not require the new column. Scoped startup
requires exact keepintax-dev identity and reviewed schema. NULL historical work is
not adopted. Keep owner/business fences, global content dedup and retention intact.
See docs/features/email-worker-scope.md for guarded DEV application and the required
all-worker update before removing temporary exclusive ownership.
## Business routing

See ../../../docs/features/gmail-business-routing.md. Mailbox settings and sender
rules are owner-only; every provider call and new AI call rechecks current rules.
Block beats all defaults. Exact buyer tax identity beats sender/mailbox routing.
Source dedup is owner + mailbox + message + MIME path, independent of final
business; preserve immutable runs/items when moving the retained import row.
ROUTING_PENDING freezes the saved result/decision before a same-file move to the
existing target processed folder. Resume after Drive success/DB failure without
AI or upload. Only unedited PROCESSING claims can move. Never delete duplicates
in the target. Resolve classification against the final catalog or clear it.
Three nullable JSON columns are prepared only; no database application authorized.
