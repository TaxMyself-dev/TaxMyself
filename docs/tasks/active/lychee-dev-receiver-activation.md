# Lychee development receiver activation

- User explicitly authorized SQL on dev and receiver activation through the
  existing fixed ngrok domain. No messages, GitHub push or production changes.
- Base: b12bf0f0, worktree TaxMyself-whatsapp.
- Applied CREATE TABLE only to keepintax-dev after checking DATABASE() identity.
  Verified 22 columns. No Nest boot during migration; no production access.
- Added guarded rerunnable dev migration helper and local receiver launcher.
- Local backend runs port 3000 with synchronization/seeds/schedules/worker off.
- Existing ngrok agent (not replaced) points fixed hostname to localhost:3000.
- Verified unsigned empty POST locally and publicly: HTTP 503 (secret missing),
  not 404. No events stored and no outbound messages/API requests.
- URL: https://margeret-guttiform-overfondly.ngrok-free.dev/webhooks/lychee
- No API key or webhook secret was configured in this worktree during inspection.
  Keys themselves were never printed. Secret must be supplied before signed test;
  API key/media hostname allowlist are needed before enabling processing.
- Validation: Nest build exit 0; node --check on both new helper scripts; diff
  whitespace check. Previous backend 49 checks passed before this activation.
- Initial sandbox database request was denied EACCES and succeeded with narrow
  escalation. Initial sandbox ngrok attempt was stopped; host agent was already
  active. No other process was stopped or replaced.
