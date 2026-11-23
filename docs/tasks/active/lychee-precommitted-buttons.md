# Precommitted Lychee business choices

- Status: COMPLETE_IN_FEATURE_WORKTREE
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
- Initial live-test prerequisite (subsequently resolved below): existing ngrok
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

## Live development acceptance (2026-11-23)

- Tested executable revision: 7ff47d04. User corrected ngrok to localhost:3000 and
  sent the genuine `בדיקות` command; ROUTE_COMMAND_DEV persisted at 09:10:10Z.
- User sent a real document and clicked `2. שובל`. Document event
  `c510abdf-c50b-4307-9243-d21f1d7af702`; reply event
  `ee9e8c9a-940f-440a-a6a2-a547d3764844`.
- Local log timeline (Israel time): document/choices committed 11:11:14; question
  HTTP accepted 11:11:18; quote mapping complete 11:11:19; click processed 11:11:27;
  Drive upload/import completed 11:11:33; result notification accepted 11:11:36.
- Read-only dev verification confirmed the incoming `button_id` exactly equals
  one saved choice ID; selected business is Shoval; document IMPORTED; reply
  BUSINESS_SELECTED; exactly one imported_documents row for the resulting Drive
  file; result outbox NOTICE_SENT (provider acceptance, not proof of phone delivery).
- This real click also carried a quote and occurred after receipt linking. It
  validates custom-ID round-trip and real import, not a live reproduction of the
  early-click race. The automated send-in-progress test covers that interleaving.
- Shared cloud proxy was not deployed. Production release and main integration
  remain separate approval gates. Test phone remains in development routing;
  send `סיום בדיקות` from that phone when finished. No extra resend/replay was run.
- Documentation-only evidence update: git diff --check; no repeat application
  tests needed because executable source is unchanged from tested revision.

## Authorized local main integration (2026-11-23)

- Elazar explicitly requested local main integration; remote push/deployment are
  not authorized. Main before integration: ceff13aca6bb134680833d525ecf5555c9af88ed.
- Main's effective `node frontend/scripts/start-local.js --print-config` reported
  frontendPort=4200, backendPort=3000, apiUrl=http://localhost:3000/, main defaults.
  `node backend/scripts/start-watch.js --print-config` reported backendPort=3000,
  process/environment source and synchronize=false. No port configuration changes.
- Main had no tracked changes. Its unrelated untracked
  backend/journey-timings.local is preserved in place and not staged.
- Merged current main into the feature first, without conflicts: 355b9fa1.
  Reviewed the automatic merge: retains main's immediate OCR integration together
  with custom-button selection. Candidate delta from main contains only this task.
- On combined candidate 355b9fa1, repeated the exact nine-suite backend command
  above: 209/209 tests, 9/9 suites, 73.288 seconds. `npm run build`: exit 0.
  `node --test proxy/lychee-webhook.test.js proxy/lychee-routing-store.test.js`:
  40/40 passed. `git diff --check main HEAD`: exit 0. No frontend changes, so no
  frontend build needed. Verification reused for the identical fast-forwarded tree.
- Deliver through local fast-forward only. Preserve the unrelated timing file;
  never push until Elazar personally tests the current local main and approves it.
