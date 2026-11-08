# Lychee per-sender test commands

Superseded storage architecture: test mode now lives directly in the proxy's
development SQL adapter, not a backend endpoint. See lychee-proxy-direct-db.md
in this task directory and the feature server setup guide for current requirements.

- Status: `MANAGER_REVIEW`
- Task manager: current WhatsApp feature chat
- Worker: none
- Worktree: TaxMyself-whatsapp
- Branch: codex/whatsapp-integration
- Base commit: b822f9e7

## Business outcome

Allowlisted testers can send captionless documents to development after sending
`בדיקות` in the same WhatsApp conversation; `סיום בדיקות` restores production.

## Acceptance criteria

- [x] Only configured test senders can change mode, independently per sender.
- [x] Commands are standalone unquoted text, not captions or document imports.
- [x] Quoted replies retain question ownership routing.
- [x] State survives proxy restarts/replicas and retries keep the original route.
- [x] Focused offline tests, backend build and diff checks pass.
- [x] No deployment, push, production access, schema execution or messages.

## Scope and constraints

- In scope: proxy adapter, signed internal routing endpoint, durable routing
  journal using existing intake columns, focused tests and feature documentation.
- Out of scope: branch integration, external configuration changes, API sends.
- Required reading: root/topic AGENTS, AUTHORITY and QUALITY_GATES.
- Approval boundaries: no schema changes or real database operations; no deploy.

## Handoff

- Result: locally implemented and verified; not deployed or integrated into main.
- Commit hash(es): this task's local implementation commit.
- Changed files: Lychee proxy/controller/module/log metadata, routing service,
  corresponding tests and feature docs.
- Tests and exact results: all Lychee Jest suites passed; final routing suite
  passed 10/10 tests including duplicate commands at conflicting timestamps;
  proxy tests passed 21/21; final Nest build and diff whitespace check passed.
- Known pre-existing failures: none observed.
- Schema / production / security / accounting / external impact: no schema or
  accounting changes. Same HMAC/channel boundary plus explicit backend allowlist;
  new internal endpoint only. No external API, live credential or webhook changes.
- Risks and manual checks: backend authority needs matching allowlist and existing
  intake storage before proxy activation; real MySQL concurrency not exercised.
- Documentation updated: Lychee proxy/backend feature docs.

## Integration

- Reviewed by: current feature chat, full local diff reviewed.
- Integrated commit: none; integration not requested.
- Combined verification: focused local backend/proxy checks above only; no main integration.
- `origin/main` verification: not applicable, no push.
- User-visible run instructions: deploy/configure authority backend before proxy;
  send commands in the existing document WhatsApp conversation.
