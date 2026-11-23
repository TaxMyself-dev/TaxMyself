# Precommitted Lychee business choices

- Status: IMPLEMENTED_AWAITING_LIVE_TEST
- Worktree: TaxMyself-whatsapp; branch codex/whatsapp-integration
- Base: 663214389036b05a7ddf2816dfd3cbd25bee2c24
- Authorization: Elazar requested implementation and a live development test to his designated test number on 2026-11-23. No production deployment, main integration or push.

## Acceptance

- Persist unique opaque choice IDs with the document and outbox in the existing transaction before sending.
- Preserve `buttons[].id` for buttons and lists; accept the signed `button_id` (maximum 200 characters).
- Route and select by the persisted ID, channel, sender and current owner, without waiting for a WhatsApp receipt. Unknown IDs never fall back to a recent document or label.
- Preserve old quoted choices and repeated-selection explanations, and allow receipt persistence after an early selection.
- Focused backend/proxy tests, Nest build, review and local commit.
- Live development: verify ngrok, development database and test routing; send a bounded test question only to the authorized number and inspect one real click. No fabricated provider messages or production imports.

## Verification

- Initial diagnostic: existing proxy tests passed 36/36. Initial backend sample passed 186 tests but six loopback HTTP tests were sandbox-blocked (EACCES); one guessed test filename did not exist. Corrected the selection and reran with loopback permission.
- Updated proxy checks: `node --test proxy/lychee-webhook.test.js proxy/lychee-routing-store.test.js`, 40/40 passed.
- Final backend command (all nine suites on the final executable source):
  `npm test -- --runInBand --runTestsByPath src/whatsapp/lychee-button.spec.ts src/whatsapp/lychee-prompt.spec.ts src/whatsapp/lychee-intake.spec.ts src/whatsapp/lychee-prompt.transport.spec.ts src/whatsapp/lychee-business-question.spec.ts src/whatsapp/lychee-webhook.controller.spec.ts src/whatsapp/lychee-notification.spec.ts src/whatsapp/lychee-reply-diagnostic.spec.ts src/whatsapp/lychee-prompt-diagnostic.spec.ts`
  passed 9/9 suites, 209/209 tests in 65.819 seconds. Covers early selection inside
  send, receipt linking after selection, repeated-choice explanation without quote,
  multiple documents answered out of order, legacy labels, raw HMAC, and ID bounds.
- `npm run build`: exit 0. `git diff --check`: exit 0. No snapshots were updated.
- One added notification test initially edited only the caller's event instead of
  its persisted fake-DB copy. Reviewed failure, corrected the fixture, reran affected
  suite (56/56), then ran the final consolidated nine-suite check above.
- Read-only development MySQL verification: actual database keepintax-dev;
  JSON_CONTAINS object-in-array matching works; one account/two owned businesses
  for the authorized phone; both have Drive folders; no pending intake/outbox work.
- Live test is NOT executed and no live test message has been sent. Existing ngrok
  target is `http://3000backend:80`, not localhost:3000; latest genuine test-phone
  routing command is still ROUTE_COMMAND_PROD. User was asked to run `ngrok http 3000`
  and send `בדיקות` before a test document. Do not fabricate inbound provider IDs.
- User explicitly authorized replacing the primary checkout's port-3000 server.
  Replaced only that process; final feature backend is running on 3000 with
  synchronize=false and SKIP_BOOT_SEED=true. Local HTTP health returned 200.
- Proxy changes are local only. Removing the race through the shared live proxy
  requires shipping its custom-ID routing too; no cloud deployment was authorized
  or performed. An old deployed proxy may still require a saved quoted mapping.
- No schema, production data, accounting, credentials, main integration or push.
  API compatibility change is limited to the vendor-confirmed optional custom ID.
