# Lychee immediate questions, explicit blockers and import timing

Authorized: local implementation and mocked tests only. No live messages, app
startup, database writes, deployment, main integration or GitHub push.

- New multi-business documents persist WAITING_FOR_BUSINESS, choices and the
  existing idempotent question outbox immediately after account/business checks,
  before requesting a media link. Wake the question worker only after commit.
- Download/validate a fresh media link after an explicit owned business selection.
  This moves download time after selection rather than parallelizing it. Existing
  waiting documents with cached validated bytes continue to reuse them. No detached
  tasks, new leases or schema fields; a restart does not lose the source message ID.
- Tradeoff: unsupported content is detected after business selection; media must
  still be available at Lychee then. The API is asked for a fresh signed URL at use.
- Typed DRIVE_FOLDER_MISSING, UNSUPPORTED_MEDIA_CONTENT and INVALID_MEDIA_SIZE
  are explicit local blockers. Commit BLOCKED_IMPORT/last_error and the notice in
  the existing table atomically, preserving the actual attempt count. The message
  describes the blocker, without saying several retries occurred.
- Keep remote HTTP statuses (including 400/403/404), network failures and unknown
  failures on the existing retry path. Do not parse arbitrary provider strings to
  declare permanence. Unidentified or ambiguous accounts still receive no message.
- Importer accepts optional traceEventId (not persisted). New safe duration lines:
  drive.import.business.resolve, content.hash, db.dedup, db.folder_lookup,
  drive.provision, db.folder_save, drive.list, drive.recovery.verify, drive.upload,
  db.import_save, db.race_lookup and drive.cleanup. drive.list measures both
  folder reads together in parallel; repeated recovery.verify measures each
  candidate. The outer drive.import remains aggregate; do not add it to its children.
- The shared importer keeps ownership scope, dedup, orphan recovery, compensation,
  error identity and non-Lychee behavior. Missing-root errors retain HTTP 400 and
  add an internal typed blocker code; other callers do not enable timing by default.
- Existing authorized development-only question/result transport bindings remain
  unchanged. Tests simulate all SQL/Drive/HTTP boundaries and never start the app.

Validation: 118 mocked tests passed across eight regression suites; the final
targeted rerun passed 44 tests across intake and import tracing (including the
additional correlation-ID privacy case). Backend build and git diff --check
passed. SQL/Drive/HTTP stayed mocked; no application was started or live data changed.
Schema/auth/accounting/external-contract/production impact: none. Existing nullable
queue fields and varchar statuses are used; no migrations or environment changes.
