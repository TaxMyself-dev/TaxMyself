# Feezback ten-minute access-token lifetime

- Status: `VERIFIED_LOCAL`
- Worktree: `C:\Users\user\Keepintax\TaxMyself-feezback-token-expiry`
- Branch: `codex/feezback-token-expiry`
- Base commit: `59605b6500ffdbe385922d065160e4dd3da2771a` (verified local main; includes two existing local proxy commits beyond origin/main)

## Outcome and acceptance criteria

Feezback support confirmed that access tokens last ten minutes. Elazar authorized a local fix and tests, with no push or deployment.

- Token cache lifetime is at most 600 seconds even without expiry metadata or with a larger reported value; shorter valid reported lifetimes are honored.
- Renew 60 seconds before expiry and include token-request latency in lifetime accounting.
- Paginated account/card pulls and retry backoffs check authentication on every HTTP attempt and renew during long operations.
- A failed refresh must propagate without sending an expired cached token.
- Preserve token redaction and existing retry rules; no schema, accounting, external contract, credential, or production changes.

## Validation

Focused Jest run with explicit --runTestsByPath for src/feezback/core and src/feezback/consent: 9 suites, 106 tests passed (exit 0), including 20 new token-lifetime tests. npm run build passed (exit 0). git diff --check passed. Tests use mocked HTTP and simulated time only. An initial path-pattern run also matched the worktree name and was stopped; no full-suite result is claimed.

## Delivery boundary

Local branch only. No main integration, push, or deployment requested for this change.

## Reliability worktree integration

Applied at Elazar's request onto codex/feezback-sync-reliability, preserving its existing reliability commits. Only an additive AGENTS.md documentation conflict required resolution. Combined verification: the same nine core/consent suites passed (106 tests), npm run build passed, and the working tree is clean. No push or deployment.
