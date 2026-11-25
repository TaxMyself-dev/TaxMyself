# Email document links

- Status: `WORKER_COMPLETE` (pending local main integration approval)
- Task manager / worker: Codex (single task)
- Worktree: isolated feature checkout attached to this chat
- Branch: `codex/email-document-links`
- Base commit: `7cdc85809fe62746405dcf83de0f73d641572156` (verified equal to origin/main)

## Business outcome

Import linked PDF documents from connected email into the existing durable document pipeline, with actionable owner-scoped manual handling when download is unavailable.

## Acceptance criteria

- [x] Discover document links in full email bodies, including messages without attachments.
- [x] Download public PDFs via guarded HTTP or isolated browser; use bounded model selection only when needed.
- [x] Preserve source identity, sender/business authorization, content dedup and PDF inspection.
- [x] Persist failures with safe reasons, original-link access and manual replacement linked to the source item.
- [x] Bound runtime, response size, model usage and browser actions; block internal network access and destructive actions.
- [x] Focused backend/frontend tests and builds pass; synthetic end-to-end checks exercise actual downloader.

## Scope and constraints

No live mailbox imports, database application, production activity, main integration or push. Prepare any reviewed schema changes without applying them. No supplier-specific adapters or new OAuth scopes. Use existing Puppeteer and model infrastructure where practical. Update feature/topic documentation and commit locally.

## Handoff

Result: implemented in the isolated feature branch. No live imports, DB application,
production calls, integration, push or deploy. Existing main was clean and equal to
origin/main at dispatch. Local backend environment was copied and verified ignored;
existing tracked landing configuration was retained. Dependencies were installed
independently in the feature checkout, with no shared node_modules. No app servers
were started; isolated fixtures/Karma used their own ports and were stopped.

Risk tier: backend service/controller/domain plus runtime/dependency boundary and
frontend component behavior. No accounting/journal/category changes. No new schema,
OAuth scopes or Composio tool slugs; Outlook selects its existing tool's full body.

Verification batches (all exit 0 unless explicitly stated):

1. Backend `npm test -- --runInBand --runTestsByPath
   src/integrations/providers/composio-outlook.provider.spec.ts
   src/email-intake/email-intake-runs.spec.ts src/email-intake/email-intake.store.spec.ts
   src/integrations/services/gmail-sync.service.spec.ts`: 4 suites, 46 tests passed.
2. Backend consolidated focused run, with
   `--globals '{"ts-jest":{"isolatedModules":true}}'`, selected
   `links/link-policy.spec.ts`, `links/link-intake.spec.ts`,
   `integrations/providers/composio-outlook.provider.spec.ts`,
   `integrations/services/outlook-intake.spec.ts`,
   `integrations/services/gmail-reader.service.spec.ts`,
   `email-intake/email-normal-mode.spec.ts`, and
   `integrations/integrations.controller.spec.ts` (paths under `src/email-intake`
   for links): 7 suites, 104 tests passed, 79.771 s.
3. After the final scanner/manual lock correction, reran affected
   `src/email-intake/links/link-intake.spec.ts`,
   `src/email-intake/email-intake-runs.spec.ts`, and
   `src/email-intake/email-intake.store.spec.ts` with the same Jest options:
   3 suites, 35 tests passed, 21.129 s. This is mixed-batch evidence, not a claim
   that the full 104-test selection reran after that isolated correction.
4. Backend `npm run build`: passed after final executable changes.
5. Backend `node test/link-download-simulation.cjs`: 12/12 expected outcomes,
   9 actual PDF downloads verified by parsing and exact SHA-256, two manual cases
   and one invalid-file rejection; zero destructive requests. Download scenarios
   took 0.227–9.781 s in the final full run. Selector stubbed, no model-cost claim.
   This preceded only the queue source-lock correction; downloader inputs/code
   remained unchanged, so the passing browser evidence was reused.
6. Frontend `npm test -- --watch=false --browsers=ChromeHeadless
   --include=src/app/pages/book-keeping/archived-documents/email-document-links.component.spec.ts
   --ts-config=tsconfig.email-document-links.spec.json
   --karma-config=karma.email-document-links.conf.js --progress=false`:
   6/6 component tests passed in Chrome Headless. Only formatting followed.
7. Frontend `npm run build -- --configuration production`: passed on final UI
   source. Build still reports existing style/initial-size, unused-import and
   CommonJS optimization warnings; no change was made to those unrelated files.
8. Backend `npm ls parse5 entities --all`: passed. Lockfile narrowed to required
   parse5/entities placement; unrelated npm peer-resolution churn removed.
9. `bash -n backend/scripts/link-browser.sh` (from repository root, or the matching
   relative path from backend): passed using installed Git Bash.

Failed diagnostic checks and limits:

- Initial dynamic-browser simulation passed 8/12. Inspection found proxy settings
  needed on the isolated context and a download-file rename race. Affected cases
  were rerun first; the consolidated actual-downloader run then passed 12/12.
- An early intake test mock omitted end-of-scan behavior; corrected its synthetic
  run state, then passed the affected tests. No production criteria were weakened.
- Default frontend test tsconfig compiled unrelated legacy specs despite
  `--include` and failed before executing tests. The supplier spec's TS2724 export
  mismatch was reproduced from exact `7cdc8580` files using TypeScript semantic
  diagnostics. The isolated component config avoids those files; this is not a
  passing claim for the legacy umbrella suite. An initial CLI `--port` was rejected;
  dedicated port 9893 is now set through the supported Karma config.
- Docker runtime/image check not executed: local Docker engine pipe was absent.
  Shell syntax was checked, but Linux privilege drop and host Chromium sandbox
  compatibility remain a deployment prerequisite. No unsafe browser flags added.
- No real-supplier coverage percentage, live Composio import, database transaction
  integration run or production sandbox verification is claimed. SQL ownership,
  scope, lease, dedup and lock behavior was exercised with focused offline mocks.

Documentation: feature guide, nearest intake/integrations/archive topic docs and
this task record. Authorized local feature commit recorded by the branch history.

## Integration

Await Elazar's explicit approval before local main integration. After approved
integration, his personal test of that exact main revision and separate push
approval are still required. Retain the feature worktree until approved integration
and its required checks/cleanup; do not delete the branch.

## Follow-up: download containment and public fixture navigation (2026-11-25)

On top of 0366659c5924704cf45713600850179bb552cc91:
- Deny downloads in the browser default context; only the explicit isolated job
  context can download into its temporary directory, removed in finally.
- Document selection considers action text and URL pathname, not hostname/query
  keywords. Public fixture navigation previously matched the document-named host
  and led dynamic scenarios to the index and a false LINK_EXPIRED result.
- Focused command: npm test -- --runInBand --runTestsByPath
  src/email-intake/links/link-policy.spec.ts --globals
  '{"ts-jest":{"isolatedModules":true}}': 34/34 tests passed.
- Backend npm run build: passed. node test/link-download-simulation.cjs:
  12/12 expected outcomes, 9 PDF downloads, zero destructive requests; asserts
  default-context download denial. No paid model calls.
- Public synthetic Site direct/javascript/blob/two-step probe using actual compiled
  downloader: 4/4 passed, 2085/2093/2083/2088 bytes; zero model calls. Downloads
  directory snapshot had zero added/modified files. Three browser job temporary
  directories were removed. Probe lives outside Git in the original workspace
  tmp/verify-link-download-location.cjs; it does not import mail or write Drive.
- User-reported Downloads ction-1.pdf, ction-1 (1).pdf and tion-2.pdf have FillFaster
  metadata, unlike ReportLab fixtures. Their source remains unconfirmed: passing
  synthetic containment checks do not establish their origin or fix that report.
- No broad suite rerun, main integration or GitHub push in this follow-up.
