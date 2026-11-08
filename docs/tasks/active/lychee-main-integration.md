# WhatsApp/Lychee local main integration

User authorized merging the completed WhatsApp feature into local main. No push,
deployment, real webhook messages, application startup or database execution.

- Starting feature tip: f6c3e04a (codex/whatsapp-integration).
- Starting clean main: fcc7b0c1. Refreshed origin/main and confirmed identical.
- Feature had 33 unique commits; main had 222 unique commits. Merge main into the
  existing feature worktree first, verify the combined tree, then merge into the
  user's clean main checkout with --no-ff to retain its first-parent history.
  Do not modify the occupied codex/integration branch.
- One textual conflict in backend/package.json: retain main's smoke:cleanup and
  smoke:verify scripts together with start:whatsapp:sandbox. No dependency/version
  changes beyond main's package-lock; install independently in the feature worktree.
- Preserve main's readiness/startup/PDF middleware and entity registrations. Keep
  Lychee module registration and raw-signature body middleware. No accounting or
  schema semantics are edited during integration.
- Proxy/server.js differs from main only by its final newline; Feezback/Cardcom
  logic and the latest main body handling/log redaction are preserved.
- Existing feature SQL is included as previously approved source only; no schema
  scripts or lifecycle cleanup scripts are executed by this integration.
- Main's ignored backend/.env lacks LYCHEE_WEBHOOK_SECRET, LYCHEE_CHANNEL_ID,
  LYCHEE_API_KEY, LYCHEE_MEDIA_HOSTS and LYCHEE_TEST_PHONES. Do not overwrite or
  copy its environment without a separate user request; manual testing from main
  requires those settings. No credentials are printed or committed.
  Main uses keepintax-dev / development, but its GOOGLE_DRIVE_ROOT_FOLDER_ID also
  differs from the corrected WhatsApp environment and is left unchanged.

Verification of the combined tree: 270 backend tests across 22 suites passed
(WhatsApp/Lychee, shared importer and Feezback review/sync regressions), plus
61 cloud-proxy mock/local HTTP tests and 6 standalone local-proxy tests. Ten HTTP
tests initially hit sandbox localhost EACCES; those two suites passed on a rerun
with loopback access. Backend npm ci, Nest build and git diff --check passed.
Main's existing direct backend dependencies match its lockfile; no reinstall or
environment edits are required for code verification there. Actual WhatsApp
manual testing still requires the environment settings above. No app was started.
Delivery uses the verified feature tree and a main-first-parent local merge;
verify tree identity and clean worktrees after updating main. No remote push.
User must manually test current main and explicitly approve any future GitHub push.
