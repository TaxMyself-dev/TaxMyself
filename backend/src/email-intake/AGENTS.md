# Durable Gmail intake

Owns persisted scan/work state. Pull, processing and confirmed-negative deletion are always available; no runtime feature switches or test-subject override. The reviewed schema must be present before starting this release. Schema preparation is not schema authorization. All claims, decisions and tombstones are owner/business scoped; never use attachment IDs as content identity. Only a complete explicit negative permits an exact-file deletion, after ownership/reference/race checks. Unknown AI outcomes are never replayed blindly. Do not start Nest, connect live databases, run imports/AI or delete files during development. No main integration, push or deploy.


## Outlook through Composio

Settings now supports Microsoft Outlook alongside Gmail. OAuth state is provider-bound;
the backend validates managed auth config, toolkit, owner, active account and identity.
Read tools are allowlisted separately per toolkit. The persisted provider selects the
reader; date windows, durable runs, owner restrictions and content-hash dedup are shared.
Historical GMAIL source/metadata names identify this shared email pipeline internally.
See `docs/features/outlook-email.md` for configuration and the verified DEV-only schema and pending live OAuth verification.
