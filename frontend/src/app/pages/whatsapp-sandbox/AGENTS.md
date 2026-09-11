## Purpose

Development-only visual harness for the offline WhatsApp channel. It lets a
tester act as a customer or as KeepInTax and inspect bounded parser/provider
results without Meta credentials, external traffic, persistence, Drive, or OCR.

## Key files

- `whatsapp-sandbox.page.ts` — calls the dedicated local sandbox API on port
  3001, manages the simulated conversation, and limits uploads to 2 MB
  PDF/JPEG/PNG files.
- `whatsapp-sandbox.page.html` / `.scss` — RTL phone preview, outgoing-template
  controls, delivery-state display, and a safe metadata inspector.
- `whatsapp-sandbox.page.spec.ts` — focused HTTP/UI state tests. The repository
  Karma runner still compiles unrelated legacy specs even with `--include`.

## Invariants

- The route is linked only when `environment.enableDevTools` is true.
- Production and DEV-cloud environment replacements provide no sandbox API
  URL; the backend independently requires `WHATSAPP_SANDBOX_ENABLED=true` and
  returns 404 in `NODE_ENV=production`.
- File contents are sent only to the local sandbox endpoint, held in memory for
  one request, and never displayed, logged, persisted, or forwarded.
- The sandbox is not evidence that live Meta callbacks, templates, temporary
  media URLs, Drive import, OCR, or production delivery work.

## Related topics

- `backend/src/whatsapp/AGENTS.md` — local sandbox and real webhook boundaries.
- `docs/plans/whatsapp-integration.md` — gated WhatsApp delivery plan.
