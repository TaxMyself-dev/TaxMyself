# Feezback payment source deletion

- Status: `MANAGER_REVIEW`
- Task manager: Codex (direct user request)
- Worker: same chat
- Worktree: existing Feezback worktree, as explicitly requested
- Branch: `codex/feezback-delete-payment-source`
- Base commit: `25864c52` (existing Feezback feature)

## Business outcome
Delete disconnected payment sources from Settings, and explain how to replace consent for connected sources.

## Acceptance criteria
- [x] Delete action on open-banking account rows, including Direct and spouse sources.
- [x] Active consent shows explanation that a new consent must select desired accounts/cards.
- [x] Disconnected source is deleted locally after confirmation; historical transactions remain.
- [x] Server enforces ownership and blocks active consent independently of browser state.

## Scope and constraints
- In scope: source metadata, settings action, focused tests and topic documentation.
- Out of scope: provider changes, consent revocation, schema changes, production operations.
- Required reading: root, settings and transactions AGENTS; Feezback AGENTS; quality gates.
- Approval boundaries: development and local commit only; no integration or deployment requested.

## Handoff
- Result: implemented; local verification passed.
- Commit hash: see branch history.
- Changed files: transactions controller/service, settings page and transaction client service, focused specs and topic docs.
- Tests: backend: npm test -- --runInBand delete-payment-source.spec.ts source-record-association.spec.ts (2 suites, 8 passed); npm run build passed. Frontend: npm run build -- --configuration production passed (budget/CommonJS warnings); 4 focused ChromeHeadless tests passed.
- Standard frontend runner blocked by unrelated spec compilation errors; isolated TypeScript configuration used temporarily (extends tsconfig.spec.json; types jasmine/node; skipLibCheck true; include settings-source-deletion.spec.ts and src/**/*.d.ts). Run ng test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings/settings-source-deletion.spec.ts --ts-config=<isolated-config>. Temporary config removed after verification.
- Schema / production / accounting / external impact: none. Historical data is retained; no Feezback API call.
- Security: FirebaseAuthGuard, effective-user ownership, permanent source ID, transactional locked consent check.
- Risks and manual checks: no live DB/provider or browser E2E operations performed; consent status follows persisted discovery/webhook state.
- Documentation: settings and transactions AGENTS updated.

## Integration
- Pending review; remain on requested feature branch.

## Popup refinement
User requested source number, provider-neutral wording and a normal centered size. Added a dedicated payment-source confirmation host with 28rem width and viewport max-width. Both normal and stale-consent explanations receive the selected source number. Focused assertions cover number, wording and dialog key.
