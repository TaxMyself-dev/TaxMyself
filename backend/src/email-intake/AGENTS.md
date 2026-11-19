# Durable Gmail intake

Owns feature-gated persisted scan/work state. Default flags must perform no SQL, Drive or provider work. Schema preparation is not schema authorization. All claims, decisions and tombstones are owner/business scoped; never use attachment IDs as content identity. Only a complete explicit negative permits an exact-file deletion, after ownership/reference/race checks. Unknown AI outcomes are never replayed blindly. Do not start Nest, connect live databases, run imports/AI or delete files during development. No main integration, push or deploy.
