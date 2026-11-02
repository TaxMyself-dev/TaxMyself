# Automatic Lychee document processing

- User explicitly requested removing the worker-enable flag entirely; normal
  backend startup now always schedules queue processing (10-second interval).
- Removed the gate and legacy receiver launcher's disabling overrides. No schema,
  channel ID, cloud config, deployment, messages or GitHub push changed.
- User confirmed provider uses existing Keepintax channel and now delivers ALL
  incoming messages. Added regression for corrected payload and null sender.
- Presence-only local environment check: signing secret/channel configured;
  API key and allowed media host list missing. No secret values printed.
  Obsolete worker flag was already absent from local .env.
- Pending/retry rows will process after restart, FAILED rows are not reset.
- Remaining: key/media configuration, real file/Drive test, business-question send
  and mapping integration, support/document separation, deployment of local
  optional-sender/caption/reply-ownership updates. Production schema not applied.
- Verification: focused backend tests and Nest build results recorded in chat.
