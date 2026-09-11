## Purpose

Offline-first WhatsApp Business Platform channel boundary. Stage 1 exposes a
disabled-by-default Meta webhook verification/parser surface and provider
abstraction without persistence, document import, outgoing Meta traffic, or
support automation.

## Key entities/files

- `whatsapp.module.ts` — wires the webhook services and selects the fake or
  Meta provider from fail-closed configuration.
- `whatsapp-webhook.controller.ts` — public Meta GET verification and signed
  POST endpoint at `/webhooks/meta/whatsapp`; returns no message content.
- `whatsapp-signature.service.ts` — verifies `X-Hub-Signature-256` against the
  exact raw bytes with HMAC-SHA256 and constant-time comparison.
- `whatsapp-webhook.parser.ts` / `whatsapp.types.ts` — reduce official-style
  text, image, PDF/document and delivery-status payloads to internal DTOs.
- `whatsapp-raw-body.middleware.ts` — preserves Meta's signed JSON bytes and
  defers parsing until after signature verification.
- `fake-whatsapp.provider.ts` — deterministic in-memory provider for local
  development and tests.
- `meta-whatsapp.client.ts` — configuration-gated Stage-1 boundary that
  deliberately refuses network calls until the separately approved live spike.
- `whatsapp-sandbox.controller.ts` / `whatsapp-sandbox.service.ts` —
  development-only visual test boundary. It creates signed in-memory fixtures,
  exercises the real parser and fake media/template provider, then discards
  uploaded bytes before returning bounded metadata.

## Main flows

- The feature is unavailable unless `WHATSAPP_ENABLED` is exactly `true`.
- `WHATSAPP_PROVIDER` defaults to `fake`; an enabled unknown provider or
  incomplete Meta configuration fails closed.
- GET verifies `hub.mode`, the configured verify token and challenge.
- POST requires the raw `Buffer`, verifies the Meta signature, then parses
  JSON. Unsupported signed events become bounded DTOs and provider payloads
  are never logged or echoed.
- Stage 1 has no database entities, idempotency ledger, media download,
  `DocumentImportService` call, Notification/Outbox integration, UI, or live
  external effect.
- The local sandbox is available only when `NODE_ENV` is not `production` and
  `WHATSAPP_SANDBOX_ENABLED=true`. It is independent of the disabled real
  webhook feature flag, performs no external I/O, and is not a live-Meta test.

## Related topics

- `backend/src/notifications/AGENTS.md` — future outgoing channel ownership.
- `backend/src/document-import/AGENTS.md` — future inbound document ownership.
- `backend/src/inbound-email/AGENTS.md` — analogous signed public ingress.
- `docs/plans/whatsapp-integration.md` — gated product and implementation plan.
