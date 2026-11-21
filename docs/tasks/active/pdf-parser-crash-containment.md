# PDF parser crash containment

Status: IMPLEMENTED, focused verification passed; DEV health checkpoint below. Base 59ab91de on existing codex/composio-email; initially clean. User authorized fixing PDF crashes with focused tests, keeping AI/deletion off; no PROD/main integration/push.

Acceptance: reproduce old font failure with a synthetic file, read that file after fix, contain actual asynchronous child crash without losing host HTTP health, retain password/permissions/damage/page/byte distinctions, terminate hung parser, preserve no-AI/deletion boundaries and existing Gmail intake behavior.

Files: PdfInspectionService and extractPdfText now use isolated pdf-parser-process; adapted boundary mocks and added real crash/HTTP/embedded-font/later-page tests. No dependency, schema, frontend or accounting changes. Detailed commands, revisions, diagnostic compile failure/correction, results and limits: docs/features/pdf-parser-isolation.md. Build passed; 64-test final compatibility checkpoint and smaller passing boundary checkpoints recorded there. No repeated full suite.

DEV .env read-only check confirmed PROCESS/DELETE/legacy OCR/nightly/dispatch false and synchronize disabled. No environment file changes. Restored built backend 3002 only after passing checks with existing DEV credentials/scope and skip seed enabled; no new import request. Existing authorized run can resume. No external API/DB call during synthetic tests; startup health is checked separately. No main merge, push or deploy.

DEV post-start checkpoint passed: built backend process 31544 alive after resumed scan ticks, new log reports keepintax-dev synchronize=false and listening on 3002, no document-is-not-defined in new stderr, explicit IPv4 root health HTTP 200 with status ok. This is health evidence, not a claim the entire mailbox run finished or every document succeeded. No new import endpoint was invoked.
