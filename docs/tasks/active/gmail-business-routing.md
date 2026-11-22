# Gmail business routing

- Status: `LOCAL_COMPLETE_AWAITING_MAIN_APPROVAL`
- Task manager / developer: Codex
- Worktree: C:/Users/user/Keepintax/TaxMyself-gmail-business-routing
- Branch: codex/gmail-business-routing
- Base: 712db3ce33c033b241b5263e853ba8f520802c2e (verified local main)

## Business outcome and acceptance

See [complete specification](../../features/gmail-business-routing.md).
Mailbox defaults and sender rules; exact recipient identity extracted in the same
AI call overrides defaults; recoverable same-file move; source dedup independent
of final business; settings and AI provenance shown in existing UI.

## Constraints and plan

1. Inspect intake/provider/AI/storage contracts and approval boundaries.
2. Implement tested routing policy, configuration boundary and provider guards.
3. Extend extraction and saved-result completion with audited recoverable move.
4. Add existing-settings controls and archive/review provenance presentation.
5. Focused backend/frontend regressions, Nest and Angular builds; review and commit.

No app bootstrap, real provider/AI/DB, schema application, file deletion, main
integration or remote push. Three nullable JSON columns and SQL preparation
explicitly approved by Elazar on 2026-11-22; no execution authorized.
Primary checkout has unrelated untracked
backend/journey-timings.local, preserved; isolated feature starts clean.
Existing ignored backend/.env copied without changes; no other real environment
files found in root/backend/frontend/agent. Dependencies installed independently.

## Verification / handoff

Tier: backend service/controller/domain + direct provider/shared-queue callers;
frontend service/component and shared provenance input. Full Nest and production
Angular builds, isolated browser tests and scoped backend regression. No whole
repository Jest suite or paid eval was required.

## Final behavior

- Owner-only per-mailbox default and up to 100 exact sender rules. Blocks beat
  assignments; same-sender conflicting assignments are rejected.
- Rules reload before every Gmail boundary, before signed attachment-byte fetch,
  and immediately before the paid AI boundary. Missing sender with active blocks
  fails closed. Cursor fingerprints preserve the original query and restart on
  rule changes, including rule removal and legacy unbound cursors.
- Single business is automatic; multi-business without a configured mailbox
  default must select one. Sender defaults apply per attachment, not per run.
- The same AI response extracts buyer identity separately from seller identity.
  Only one exact owned nine-digit buyer tax identity can override defaults.
- A saved ROUTING_PENDING decision moves the existing file ID to the existing
  destination processed folder. No folder hierarchy changes, extra upload or AI.
  The completion transaction revalidates owner/business/folders, the lease,
  content/file identity, unedited PROCESSING claim and target hash uniqueness.
- Reconcile category names against the final catalog and use its values, or
  clear classification. No journal, tax-law or report-total changes.
- Immutable runs/items retain source ownership/mailbox/message/MIME-path identity.
  Source dedup no longer depends on the final business; content dedup remains
  business scoped. No copies/markers in the old Drive folder.
- AI provenance is retained as structured JSON and shown as text in archive,
  review table and both shared approval/edit detail flows.

## Verification commands and exact results — 2026-11-22

Commands below ran in this feature worktree, never main. Runtime Node v24.13.0,
npm 11.6.2. Dependencies installed independently via `npm ci --no-audit --no-fund`
in backend (1176 packages, 44s) and frontend (1483 packages, about 2m), exit 0.
No lockfiles changed. Existing frontend engine declaration requests Node 20;
npm emitted EBADENGINE under Node 24, but actual production build/browser tests
below passed. Dependency deprecation warnings were retained, not suppressed.

Backend final command (backend directory):

```powershell
node --max-old-space-size=768 node_modules/jest/bin/jest.js --config='C:\Users\user\Documents\ChatGPT\Keepintax - GMAIL\tmp\gmail-routing-offline-jest.json' --runInBand --silent --json --outputFile='C:\Users\user\Documents\ChatGPT\Keepintax - GMAIL\output\gmail-routing-verified-backend.json' email-intake document-ai integrations.controller.spec.ts integrations/services/gmail-reader.service.spec.ts integrations/services/gmail-sync.service.spec.ts integrations/providers/composio-gmail.provider.spec.ts documents/gmail-extraction-prompt.spec.ts documents/gmail-document-policy.spec.ts documents/email-ai-outcome.spec.ts documents/document-recipient-extraction.spec.ts documents/documents-inbox-restore.spec.ts documents/documents-ocr-at-most-once.spec.ts documents/documents-catalog.service.spec.ts reports/reports.review-scope.spec.ts reports/report-review-classification.spec.ts
npm run build
```

- Final scoped regression: **33 suites / 319 tests passed**, zero failed/skipped,
  exit 0, 34.281s. The temporary config uses this worktree's own ts-jest with
  isolatedModules=true, no alternate dependencies or weakened assertions. Final
  Nest build independently checks application types: exit 0.
- Prior diagnostic batches (13 tests; then 29; then 127) passed on intermediate
  revisions. A 318-test consolidated pass preceded the final destination-removal
  race guard; it is superseded by the 319-test final pass, not added to its count.
- The first broad default ts-jest attempt failed due to localhost EACCES in mock
  Scheduler HTTP tests and then exhausted the 2 GB heap. This was reviewed before
  rerunning the same selected scope with bounded isolated transpilation and
  localhost fixture access. No real application, DB or provider was started.

Frontend commands (frontend directory):

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.email-spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/services/integrations.service.spec.ts --include=src/app/components/report-review-edit-dialog/email-routing-note.spec.ts --progress=false
npm run build -- --configuration production
```

- Final browser result: **18 tests passed**, exit 0, Chrome Headless 157; includes
  real rendered settings controls and escaped AI provenance text. A new rendered
  fixture initially lacked ActivatedRoute; adding the router fixture fixed it.
- Production Angular build: exit 0, hash **9b3bf83cfdd3a81d**, 147647ms. Reused
  passing evidence because production frontend inputs did not change afterward;
  only focused specs/tsconfig and documentation followed. Existing size warnings
  (including initial bundle 3.21 MB vs warning budget 2 MB) and CommonJS warnings
  remain; no budgets or executable build settings were changed.
- Ordinary sandboxed commands could not create node_modules/dist/.angular; the
  approved narrow reruns succeeded. The incomplete sandbox build also reported
  style-size errors; these did not recur as errors in the valid production build.
  A baseline export was prepared, then canceled and removed once the successful
  build resolved the concern. No baseline build was executed or claimed passing.

Documentation/schema static checks:

```powershell
node 'C:\Users\user\Documents\ChatGPT\Keepintax - GMAIL\tmp\check-gmail-routing-docs.cjs'
git diff --check
```

Three changed/new local Markdown targets verified; correct root AGENTS discovery;
exactly three approved nullable JSON ALTERs match cutover.sql. No existing
repository Markdown checker was found. Diff check passed; Git's LF/CRLF advisory
for documents.service.ts is informational. Full changed-code diff reviewed.

## Schema, approval boundaries and manual checks

- Schema: three nullable email_routing_json JSON columns only, with entity
  declarations and prepared SQL in the standalone migration and cutover.sql.
  Elazar explicitly approved preparation only. **No SQL executed.** Use one SQL
  path once; do not rerun the full historical cutover on an existing system.
- Production/provider/security: no deployment, real Gmail/AI/Drive request, live
  database access, file deletion or credential change. Settings retain the
  existing owner-only boundary; only owned businesses can be selected.
- Live end-to-end routing, real OCR accuracy and actual Drive sharing require
  separate authorized verification after schema preparation is applied. Local
  mocks validate logic/failure recovery, not deployed data or provider accuracy.
- Multi-business PDFs, domain/wildcard rules, historical reanalysis and a new
  manual business-transfer interface remain out of scope. Foreign/non-nine-digit
  buyer IDs do not change routing automatically. Target duplicates stop for
  attention without deleting or merging files.
- Primary checkout remains on the recorded main commit with its unrelated
  untracked backend/journey-timings.local preserved. No integration or push.
- Elazar's explicit local-main integration approval remains required; personal
  testing of that resulting main revision and separate push approval follow.

## Handoff

- Result: local implementation and automated verification complete.
- Executable commit: recorded after the local commit below; later evidence-only
  documentation does not change executable inputs.
- Changed files: mailbox settings/controller/provider, intake routing/persistence,
  AI recipient fields and preflight, same-file transfer, provenance wire/UI,
  focused tests, nearest topic docs, specification and prepared schema SQL.
- External logs: output/gmail-routing-verified-backend.json and .log,
  output/gmail-routing-final-nest-build.log, output/gmail-routing-frontend-production.log,
  output/gmail-routing-email-frontend-tests.log in the original chat workspace.
- No required automated checks remain. Manual/provider/schema activation checks
  above were not run and are not represented as passing.
