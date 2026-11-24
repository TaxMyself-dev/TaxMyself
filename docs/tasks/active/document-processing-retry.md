# Manual document-processing retry

- Status: WORKER_COMPLETE
- Task manager/worker: Codex (single agent)
- Worktree: isolated document-retry feature worktree
- Branch: codex/document-retry
- Base commit: 6ca36c56

## Business outcome
Owners recover technical document-processing failures from the archive or the mailbox warning without SQL edits or repeated paid analysis.

## Acceptance criteria
- Individual blocked-document retry, selected-file retry, and mailbox-wide retry in Permissions.
- Owner/business/mailbox/worker fences, bounded batches, current sender-rule and configuration checks.
- No duplicate active work or unknown paid-call replay; reuse/resume durable outcomes.
- Busy/partial-result feedback, password-copy handling remains separate, collision-safe desktop/mobile selection.
- Focused tests and package builds; local feature commit only.

## Scope and constraints
No schema, accounting, OAuth or production changes. No main integration, push or deployment authorized. Do not release or delete actual blocked documents during implementation. Required topic docs: documents, email-intake, integrations, settings and book-keeping.

## Verification
Final implementation passed the focused checks below. A first backend run found a test parameterization issue (corrected). The first frontend selector accidentally loaded unrelated specs outside the narrow tsconfig (corrected with explicit includes). A malformed installed googleapis declaration was restored from the exact integrity-verified locked package, with no dependency/lockfile changes.

## Handoff
Completed in the isolated feature branch; ready for review and explicit main-integration approval. No remote push or deployment.

- Backend: `npx jest --runInBand --runTestsByPath src/email-intake/document-retry.policy.spec.ts src/email-intake/document-retry.service.spec.ts src/email-intake/document-retry.controllers.spec.ts src/email-intake/document-retry-status.spec.ts src/email-intake/email-intake.store.spec.ts` — 5 suites, 72 tests passed on the final executable revision (25.082s).
- Backend: `npm run build` — exit 0 on the final executable revision.
- Frontend: `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.document-retry-spec.json --include=src/app/services/document-retry.spec.ts --include=src/app/pages/book-keeping/archived-documents/document-retry.spec.ts --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/components/generic-table/generic-table.component.spec.ts` — 66 tests passed. Frontend source remained unchanged after this passing run.
- Frontend: `npm run build -- --configuration production` — exit 0, build hash a9114f943179f702. Warnings remain for CommonJS dependencies and the 3.16 MB initial bundle versus its 2 MB warning budget; no build errors.
- Rendered mailbox retry button verified at 375px and 1100px, including no horizontal warning overflow and duplicate-click disabling. Desktop/mobile archive selection collision regressions passed.
- Added feature documentation references verified; `git diff --check` passed. Main remains at base 6ca36c56, clean.
- Local ignored feature launch configuration was checked separately from production build settings; no environment files, dependencies or build caches are included in the commit.
- No live database writes, provider/AI requests, mailbox imports or file deletions performed for this feature. Existing blocked documents were not released. The backend policy uses fake provider/data fixtures, scoped SQL contract tests and concurrent request tests.
- Full repository Jest and unrelated UI suites were not run: this change is confined to retry/domain endpoints, archive projection/selection and mailbox status UI; direct consumers and both package builds were checked.
- Schema / production / accounting / OAuth / external provider impact: none. Security: new owner-only endpoints with business/mailbox/worker fences and safe partial-result reporting.
- Branch and commits are retained for review. Worktree cleanup follows successful, explicitly approved main integration, not feature completion alone.
