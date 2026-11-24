# Document bank transfer details

- Status: `WORKER_COMPLETE`
- Worktree: dedicated document-bank-details checkout
- Branch: `codex/document-bank-details`
- Base commit: `abc960c914503a6d76480d5025aef83905f2dd39` (clean local main; remote refreshed)

## Acceptance criteria

- Optional bank, branch, account number and beneficiary on transaction invoices and tax invoices.
- Off by default, all four fields required when enabled, leading zeros preserved.
- Preview, original and copy display escaped RTL instructions separately from received payments.
- Draft restore and pending-allocation finalization retain the document snapshot.
- Context changes/reset prevent instructions leaking into another business/type.
- Existing documents without details remain unchanged.

## Scope and boundaries

One nullable JSON column; prepare idempotent SQL and append to cutover.sql. No live DB changes,
payment records, accounting calculations, public external contracts, deployment, main integration or push.
The existing private version-1 PDF-service model accepts one additional optional bounded object.
Personal approval gates override repository automatic integration/push instructions.

## Verification plan

Backend DTO/domain, transformation/persistence and PDF tests; Nest build.
Isolated frontend form/payload/draft/context tests; Angular production build.
Visual PDF fixture using synthetic details, without starting Nest or accessing a DB/provider.

## Completed verification (2026-11-24)

Risk tier: backend domain/service + component behavior + private shared renderer contract.
Evidence is from focused runs on the recorded feature base plus this diff, not a
repository-wide test run or a single full-suite run on a final commit. The five
template tests were rerun after the final empty-section assertion; do not count
them twice. No behavior changed after the passing affected tests.

| Package / exact command | Result |
| --- | --- |
| backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/transfer-details.spec.ts src/documents/pdf/document-pdf.template.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/documents-draft-issuance.spec.ts` | Initial diagnostic: 3 suites / 33 tests passed; new suite failed before execution because Reflect metadata was uninitialized. |
| backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/transfer-details.spec.ts` | After explicit test-only reflect-metadata initialization: 20/20 passed, exit 0 (69.144s). Covers supported/unsupported types, bad input, DTO whitelist, transform/save/load, allocation finalization, original/copy/preview and escaping. |
| backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/document-pdf.template.spec.ts` | Final template assertions: 5/5 passed, exit 0 (16.339s). |
| backend: `npm run build` | Passed, exit 0. |
| frontend: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.doc-transfer.spec.json --include=src/app/pages/doc-create/doc-create-transfer.spec.ts --progress=false` | 8/8 passed, exit 0. Chrome launcher reported slow cleanup after all tests passed. |
| frontend: `npm run build -- --configuration production` | Passed, exit 0; build hash `2bef6463a1e5e2ec`, 163119ms. Nonblocking warnings: 3.15 MB initial bundle vs 2 MB warning budget; document styles 7.89 kB vs 6 kB warning budget; other style budgets, NG8113 in unchanged SettingsNewPage, and CommonJS dependencies. Warnings were not separately reproduced on the base. |
| pdf-service: `npm run build` | Shared template compiles standalone, exit 0. |
| pdf-service: `npm test` | Final service/contract tests: 23/23 passed, exit 0. |
| Git: `git diff --check` | Passed. Full implementation, tests, nullable SQL and staged file scope reviewed. |

Dependencies installed independently with `npm ci --no-audit --no-fund` in all
three packages. Local Node is 24.13.0; frontend requests Node 20 and pdf-service
requests Node 22 (npm engine warnings). No package/lockfile changes. The copied
backend environment was confirmed ignored and identical without exposing values;
the primary checkout had no other ignored .env/local environment files matching
the inventory. No environment/build/dependency files are committed.

The first parallel backend/frontend build attempts were intentionally stopped
after memory exhaustion was measured (about 400 MiB free); both builds were
then run to completion sequentially. No passing evidence is claimed for those
interrupted attempts. Unrelated processes were untouched.

Visual QA used three synthetic unsigned PDFs via the actual local renderer:
tax invoice (1 page), transaction invoice preview (1 page), multipage copy
(4 pages). Poppler PNG inspection confirmed readable Hebrew, mixed beneficiary
text, leading-zero account/branch identifiers, footer clearance and an unbroken
instruction block. pypdf confirmed account `000123456` in all three PDFs.
The sandbox initially denied Chromium loopback; rerunning the same local
fixture with the required filesystem/network permission succeeded. Optional
pdftotext was unavailable, so pypdf handled text verification instead.

## Delivery and remaining boundaries

- Result: implementation, focused verification and documentation complete in the feature branch.
- Known baseline failures: none observed in selected passing suites; unrelated suites were not run.
- Schema: additive nullable JSON; idempotent SQL prepared, appended to cutover.sql, NOT executed.
- Production/security: no deployment, live provider/DB access or secrets in Git; existing business ownership checks preserved.
- Accounting: no payment rows, totals, tax, numbering or journal changes.
- Manual follow-up: apply schema before booting the changed backend; test the optional form and an actual draft/allocation flow in the intended environment.
- Integration/push: awaiting Elazar's explicit local-main integration approval. No main modification or push. Manual main testing and a separate explicit push approval remain required.
- Documentation: feature guide/SQL, nearest frontend/backend AGENTS.md, and this task record.

## Layout follow-up (2026-11-24; parent d22eb0c9)

User requested removing the bank-details frame, lowering the entire block, and
keeping its heading plus all details together when it moves to the next page.
The shared template now has no frame/padding, a 25 mm top margin, and both
modern and legacy print break-inside avoidance on the complete section.

Verification on this follow-up:
- backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/document-pdf.template.spec.ts`: 5/5 passed, exit 0, 26.501s.
- pdf-service: `npm run build` then `npm test`: standalone template build passed and 23/23 tests passed, exit 0.
- Synthetic local Chromium renders: one-item tax invoice and transaction preview,
  6/8/10/12-item pagination boundaries, and 48-item copy (seven PDFs total).
  pypdf verified the heading, bank, branch, account and beneficiary together on
  one page per document: page 1 for the short samples, page 2 for all boundary
  samples, and page 4 for the 48-item sample. Visual Poppler PNG review confirmed
  the lower borderless layout and the complete block on the next page.
- Initial text-check marker `001` also matched the synthetic invoice number
  `20001`; corrected the diagnostic to require the branch on the block page
  without treating incidental invoice-number substrings as split bank content.
- `git diff --check` passed. No frontend, domain, schema or provider changes;
  unrelated application builds and business-flow tests were not repeated for
  this CSS-only follow-up. Prior evidence is recorded above, not claimed as a
  full run on this follow-up. No main integration, DB execution or push.
