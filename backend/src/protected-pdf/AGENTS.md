# Protected PDF lifecycle

Owns durable password-required documents and explicit replacement operations. Handling and committed replacement dispatch are always available; no runtime feature switches. Apply the reviewed schema before starting this release. Never store passwords. All operations are scoped to effective owner and business; audit actor separately. Original files remain retained in blocked storage. Replacement files stay in staging until a committed linkage and outbox delivery. Preserve existing imported-document dedup/provenance. Only owned, tagged uploads may be recovered; no filename/hash-based replacement association. Schema application, live imports/AI, production, main integration, push and deploy need separate explicit authorization.
## Email-origin routing in shared DEV

Optional EMAIL_WORKER_SCOPE routes GMAIL roots/operations by the original email
run, including server-authored metadata.emailRunId before original_import_id exists.
Guard direct delivery as well as due/recovery selections. Other sources and unset
production behavior remain unchanged. See docs/features/email-worker-scope.md.
