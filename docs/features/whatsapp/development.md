# WhatsApp document upload checkpoints

## Commit 1 Routing

Run from `backend` in PowerShell after `npm ci`:

```powershell
$env:WHATSAPP_DEV_TOKEN = 'your-local-test-token-at-least-24-characters'
npm run start:whatsapp:sandbox
```

Import `development.postman_collection.json` into Postman. Set `devToken` locally
to the same value. Keep `baseUrl` at `http://127.0.0.1:8091`.
Run folder **01 Routing (commit 1)**. Every request includes automated assertions.

You can also execute folders 01 and 02 over HTTP with the same token from a
second terminal while the sandbox is running:

```powershell
$env:WHATSAPP_DEV_TOKEN = 'your-local-test-token-at-least-24-characters'
node scripts/check-whatsapp-postman.js
```

This local checker executes the supplied collection scripts and HTTP requests;
it is not the native Postman runtime. It deliberately skips the real Drive folder.

The sandbox has two fictional bindings: 0500000001 -> sandbox-user / sandbox-business;
0500000002 -> sandbox-multi / business-a and business-b. They are not real customers.
Try no token (401), `from=abc` (400), and an unbound phone (UNKNOWN_SENDER).
Health returning READY means the local development API is ready, not that Meta or
Drive is connected. No database, Drive, account mutations or schema changes occur.

## Commit 2 Document intake

Run the collection in order, including health at the start of every run. Folder
**02 Document intake (commit 2, sandbox)** generates a small valid PDF and runs:

| Request | Expected result |
| --- | --- |
| First PDF | IMPORTED and a sandbox-file ID |
| Same message ID and same file | DUPLICATE_MESSAGE |
| Same file with a new message ID | ALREADY_IMPORTED and the original file ID |
| Unknown phone | UNKNOWN_SENDER; no import |
| Several businesses without selection | BUSINESS_REQUIRED; no import |
| Another business | BUSINESS_NOT_ALLOWED; no import |
| Unsupported MIME or mismatching file header | HTTP 400 |
| Same message ID with different bytes | HTTP 409 |
| Armed sandbox upload failure | IMPORT_FAILED, retryable=true |
| Retry of the same failed message | IMPORTED |
| Explicitly selected second business | IMPORTED in that business |

Do not run requests in parallel in the collection runner. The failure/retry pair
depends on the preceding failure-arm request. The returned Hebrew `reply` is a
preview only: no WhatsApp message is sent. An HTTP 200 means the simulation was
handled; read `status` to determine whether a file was stored.

The generated PDF is a blank transport test, not an invoice for OCR recognition.
Sandbox runs the actual DocumentImportService with in-memory repositories and
Drive I/O. `sandbox-file-*` is fictional and will not appear in Google Drive.
Successful message IDs are cached in memory (maximum 1000) and reset on restart;
this is not durable or multi-instance webhook deduplication. Failed events can
be retried manually; there is no automatic retry queue yet. PDF/JPEG/PNG headers
and size (10 MiB) are checked, not full parsing, malware scanning or OCR validity.

## Optional real development Drive check

Use this only with a confirmed development database, account and business.
The normal backend has the same endpoints when WHATSAPP_DEV_ENABLED=true; the
standalone sandbox never switches to real Drive, regardless of credentials.

Set these variables in the terminal used to start the normal backend:

```powershell
$env:NODE_ENV = 'development'
$env:DISABLE_SYNCHRONIZE = 'true'
$env:SKIP_BOOT_SEED = 'true'
$env:WHATSAPP_DEV_ENABLED = 'true'
$env:WHATSAPP_DEV_TOKEN = 'your-local-test-token-at-least-24-characters'
$env:WHATSAPP_DEV_CONTACTS = '[{"phone":"0500000001","firebaseId":"REPLACE_WITH_DEV_USER","businesses":["REPLACE_WITH_DEV_BUSINESS"]}]'
npm run start:watch
```

Confirm DB_DATABASE in your local ENV refers to the authorized development
database before starting. Do not use production or production-copy for this check.
The normal backend also starts its existing background jobs; the switches above
disable schema synchronization and the catalog boot seed, not every scheduled job.
Change Postman's baseUrl to the normal backend port (usually http://127.0.0.1:8080).
Use folder 03, setting senderPhone and businessNumber to the configured test binding.
The shared importer independently checks business ownership against the database.
Do not run sandbox failure controls or fictional bindings against the normal app.

The real import stores API_IMPORT, an existing MySQL enum value. A separate
approved schema step is required for WHATSAPP source and persistent message state.
No existing schema or enum was changed by these commits.

## Remaining milestones

Verified customer account linking, persistent events/queue, Meta webhook HMAC,
media download, outgoing acknowledgments and multi-business selection in WhatsApp.
No live Meta callback, token or phone configuration is changed here.
