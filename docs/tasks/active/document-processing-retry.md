# Manual document-processing retry

- Status: INTEGRATED
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

## Approved local main integration (2026-11-25)

Elazar explicitly approved local main integration and focused post-integration checks, with no GitHub push. Main was clean at 6ca36c56; codex/document-retry was clean at 1935f2ec and a fast-forward descendant. Integrated with `git merge --ff-only 1935f2ec`.

- Pre-integration effective configuration: frontend 4200, backend 3000, frontend API http://localhost:3000/. Verified with both local start scripts' --print-config and the listening processes. Feature overrides were confined to ignored configuration.
- Re-ran the exact focused backend command listed above on main at 1935f2ec: 5 suites / 72 tests passed (48.9s).
- Re-ran the exact focused ChromeHeadless command listed above on main at 1935f2ec: 66 tests passed, including rendered 375px/1100px retry controls and selection regression coverage.
- Reused the passing Nest and Angular production builds of the identical executable revision. No broad repository suites or redundant production rebuilds were run, as requested.
- The existing backend watcher compiled with zero errors and restarted on port 3000. Unauthenticated POSTs to both new retry endpoints returned 401. Frontend localhost:4200 returned 200 after recompilation. An earlier optional 15-second frontend request timed out during compilation; later localhost and IPv6-loopback checks both returned 200.
- No real document retries, imports, file deletions or explicit AI calls were triggered during integration checks.
- Completed worktree verified clean, exact integrated HEAD/branch, no important untracked files and no active dependent server. Its ignored backend environment and feature port configuration were copied to a private non-Git backup and SHA-256 verified before safe removal without force. The feature branch and commit are retained.
- Cleanup measurements and final removal result are recorded in the local handoff evidence; main itself is retained.
- This integration record is documentation only after the tested executable commit. GitHub push and deployment remain unapproved and were not performed.

Cleanup completed: the document-retry feature worktree was removed with git worktree remove (no force). Its measured logical file size was 4,010,918,062 bytes (3.74 GiB across 170,799 files); private configuration backups were verified and the branch was retained.
