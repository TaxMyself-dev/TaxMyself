# Lychee intake observability

- Local-only structured Hebrew explanation logs correlated by event_id.
- Covers proxy signature/channel/sender/route/reply lookup/forwarding, backend
  webhook/queue/dedup/user/business/media/import/result/retry/waiting stages.
- Safe failure classification excludes raw exceptions, remote body/config,
  credentials, signed URLs, captions, filenames, phone numbers and document bytes.
- Successful stages use existing DEBUG logging; blocked/failed stages WARN.
  No idle polling chatter; no schema or cloud configuration changes.
- Added unit tests for event/stage/HTTP failure correlation and secret redaction,
  plus proxy redaction coverage. Regression/build results recorded in chat.
- No live provider/Drive requests or messages were made. No deploy or push.
