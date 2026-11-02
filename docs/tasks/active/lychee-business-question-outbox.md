# Lychee business-question outbox (offline delivery checkpoint)

- Status: MANAGER_REVIEW
- Task manager: current WhatsApp feature chat; no delegated agents.
- Worktree: TaxMyself-whatsapp; branch: codex/whatsapp-integration.
- Base commit: a0ce08ea.
- User scope: connect delivery/provider-ID persistence without duplicate questions,
  mocked tests only. Defer success/failure notifications.

## Acceptance / result

- Atomic document wait + one stable draft, existing table and no schema changes.
- Exclusive claims, ownership checks, durable receipt before mapping; restarts
  retry linking only. Ambiguous sends quarantine, never blind resend.
- Runtime binds NoSendPromptTransport only. HTTP adapter is unregistered and
  tested exclusively with mocked axios. No fake provider IDs in real storage.
- Two-document reversed-choice flow retains separate business assignments.
- No permissions, production, live SQL, messages, main integration, deploy or push.
- Final checks passed: 7 Lychee backend suites / 56 tests, 36 proxy tests,
  Nest build, diff whitespace and source review. Fault injection included lost
  SQL acknowledgements, conflicting mappings, transient preflight errors and
  revoked business ownership.
- Immutable draft hash round-trips tolerate MySQL JSON key ordering. Local driver
  defaults include FOUND_ROWS for idempotent matched-row receipt writes.
- Local implementation commit only; no application/server/database was started
  for live testing, and no network/provider/database test calls were made.

## Limits / handoff

- Real MySQL concurrency/provider behavior are not verified by fake-boundary tests.
- Provider idempotency/automatic UNKNOWN reconciliation are not assumed.
- Earlier preview-only waits need separately reviewed backfill before live sends.
- Docs: question-delivery guide, backend guide and local WhatsApp topic AGENTS.
- Local commit only after verification; no success/failure message sender.
