# WhatsApp development intake

Development only. Explicit operator-provided test bindings are not account verification.
All endpoints require WHATSAPP_DEV_ENABLED=true and a development token of at least
24 characters. They return 404 in production. Never infer ownership from User.phone.
Always resolve an explicit business before calling the shared document importer.
The standalone sandbox binds to loopback and never loads dotenv or real credentials.
No live Meta webhook, phone-linking flow, new tables or production integration yet.

Document intake uses existing API_IMPORT source; do not extend the database enum
without the schema approval required by docs/coordination/AUTHORITY.md.
The sandbox uses DocumentImportService with fake repository and Drive boundaries.
Only the normal application's development module uses real DocumentImportModule.
Event dedup is bounded in-memory state for this checkpoint, not a production queue.
Failed imports are not cached as completed. Reply text is a preview, never sent.
