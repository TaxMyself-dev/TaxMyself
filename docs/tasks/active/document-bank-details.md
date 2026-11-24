# Document bank transfer details

- Status: `INTEGRATED_LOCAL`
- Worktree: dedicated document-bank-details checkout
- Branch: `codex/document-bank-details`
- Base commit: `abc960c914503a6d76480d5025aef83905f2dd39` (clean local main; remote refreshed)

## Acceptance criteria

- Optional bank, branch, account number and beneficiary on transaction invoices and tax invoices.
- Four fields always visible on supported forms; all blank or all complete, with leading zeros preserved.
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


## All-or-none form follow-up (2026-11-24; parent f4b97264)

Removed the bank-details checkbox. Supported document types always show all four
fields under "פרטי חשבון להעברת תשלום". A group validator accepts either four
blank fields or four complete fields. Any partial entry blocks preview/issuance
and displays an accessible group message. Entirely blank/cleared/whitespace-only
input sends null, so the existing PDF path omits the whole section. Full input
is trimmed and keeps leading zeros. Draft restoration and context resets remain.

Risk tier: component behavior. Final follow-up verification:
- frontend: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.doc-transfer.spec.json --include=src/app/pages/doc-create/doc-create-transfer.spec.ts --progress=false`: 24/24 passed, exit 0. Includes all 14 partial combinations, empty/whitespace, complete/overlong, clear, draft and business/type scenarios.
- frontend: `npm run build -- --configuration production`: passed, exit 0; hash `c2e824fbb6749876`, 138154ms. Nonblocking warnings: initial bundle 3.15 MB vs 2 MB warning budget, document styles 7.82 kB vs 6 kB, other component style budgets, unchanged SettingsNewPage NG8113 and CommonJS dependencies. No dependency/configuration changes.
- Static search confirmed no remaining bank-checkbox state/template/style references. Shared existing title/input components retained; template compiled by the production build.
- Full diff and `git diff --check` reviewed. Updated feature guide and nearest frontend/backend instructions.
- Backend executable code, PDF template, schema and private-service contract did not change; their earlier evidence above is reused, not claimed as rerun on this follow-up. No DB write, main integration, deployment or push.


## Red validation message follow-up (2026-11-24; parent 58140014)

User requested that the all-or-none bank-details validation message be red.
Added one page-local CSS rule targeting the existing alert inside the bank
section, using the page's existing red error color. No validation/state changes.

Presentation-only verification:
- Actual alert markup and the exact new SCSS rule rendered in local Chromium;
  computed color was `rgb(255, 0, 0)`. Inspected the resulting screenshot; Hebrew
  text was readable and entirely red. This was a fragment visual check, not a
  full authenticated application/browser-flow test.
- frontend: `npm run build -- --configuration production`: passed, exit 0,
  hash `1ac76fd86da0731a`, 145614ms. Nonblocking warnings: 3.15 MB initial bundle,
  document styles 7.87 kB vs 6 kB warning budget, other component style budgets,
  CommonJS dependencies and unused SettingsNewPage import.
- `git diff --check` passed. Behavioral tests were not rerun for this color-only
  change; earlier 24-case form evidence remains recorded above.
- A pre-existing uncommitted HTML edit removes the explanatory paragraph above
  the fields. Preserved it unchanged and excluded it from this commit. The build
  ran on the working tree including that edit; it is not a pristine-commit build.
- No backend, PDF, schema, business behavior, main integration or push changes.


## Authorized local-main integration preparation (2026-11-24)

Elazar explicitly requested merging into local main. Remote state refreshed;
local main `ef3ea18b` is clean and contains current origin/main. User's local
main/push gates override automatic push wording in repository coordination docs.
The previously preserved related HTML removal is included in `b9aec80e` so the
integrated form matches the current tested working tree.

Before integration, main launch configuration was verified with:
- `node backend/scripts/start-watch.js --print-config`: backend 3000, synchronize false.
- `node frontend/scripts/start-local.js --print-config`: frontend 4200, backend 3000, API `http://localhost:3000/`, main defaults.
- Inspected angular serve/default configuration and source environment API; no shell PORT override.

Merged current local main into the feature candidate. The only conflict was
two appended independent blocks in cutover.sql; retained both complete blocks
(document transfer JSON column and Feezback lifecycle schema). No application
code conflict. Package/lockfiles unchanged from the installed feature base.
No SQL executed and no database/provider/production access performed.


## Combined candidate verification

Tested merge candidate: `e9243b6d88b35faab05d82ce90206a9fe63335ec`.
The subsequent verification-record commit changes this Markdown only.

- backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/transfer-details.spec.ts src/documents/pdf/document-pdf.template.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/documents-draft-issuance.spec.ts`: 4 suites, 53/53 passed, exit 0 (82.811s).
- backend: `npm run build`: passed, exit 0.
- frontend: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.doc-transfer.spec.json --include=src/app/pages/doc-create/doc-create-transfer.spec.ts --progress=false`: 24/24 passed, exit 0.
- frontend: `npm run build -- --configuration production`: passed, exit 0; hash `12fcd3562dc45815`, 141167ms. Nonblocking warnings: 3.16 MB initial bundle vs 2 MB warning budget, document styles 7.87 kB vs 6 kB, other style budgets and CommonJS/unused SettingsNewPage import.
- pdf-service: `npm run build`: passed, exit 0.
- pdf-service: `npm test`: 23/23 passed, exit 0.
- Total: 100 distinct focused tests on the same combined candidate. No full repository suite claimed. Existing unrelated main features were preserved; no application code conflict.
- Full task diff against current local main independently reviewed, including DTO/domain/tenant scope, null payload, group validation, snapshot retention, escaped non-splitting PDF output, private service contract and additive schema.
- `git show --format= --check HEAD` and `git diff --check` passed. Executable paths remain identical to the tested candidate after this documentation record.

An initial conflict-resolution helper referenced a runtime path removed by the
desktop runtime update; corrected the unpublished local merge candidate and
verified both SQL blocks/no conflict markers before running these checks. Main
was never modified by the failed helper attempt. The ignored-file inventory
was corrected to NUL-delimited Git input to avoid Windows newline conversion;
it found only backend/.env outside reproducible dependency/build caches.

Next authorized step is fast-forwarding clean local main to this verified
candidate and removing the clean completed feature worktree after private
environment backup. No SQL, external provider/DB access, production action,
or remote push has been performed. The nullable transfer_details column still
requires the prepared SQL before the changed backend is used against a database.


## Local integration and required cleanup completed

Fast-forwarded clean local main from `ef3ea18b` to the verified feature tip
`8371ee3498c83ef5c36b1fea697695cd0166a54c` under Elazar's explicit merge approval. Source paths
are identical to tested candidate `e9243b6d`; later commits record verification
and cleanup only. Main remains configured for frontend 4200, backend 3000 and
API http://localhost:3000/. No push or production deployment was performed.

Before removal, verified the exact document-bank-details worktree path, branch
`codex/document-bank-details`, clean tracked/staged/untracked status, HEAD and
reachability from current main. No active Node development process referenced
the completed worktree. The final ignored-file inventory found only backend/.env
outside reproducible build/dependency caches. Copied it to private non-Git backup
`<Keepintax>/.codex-private-backups/document-bank-details-20261124-171722/backend/.env` and verified SHA-256
byte identity; backup manifest is private and contains no printed secret values.

`git worktree remove` (without force) removed the completed feature worktree.
Branch/commits preserved; primary checkout retained. Removed file logical size:
4274283625 bytes (3.98 GiB),
including its independent dependencies/build caches. This is logical file size,
not a measurement of filesystem allocated/free-space change.

Schema SQL remains prepared but unexecuted: apply document-bank-details.sql to
the intended database before running the changed document backend. No actual DB
or provider end-to-end test is claimed. Elazar must manually test current local
main and explicitly approve push before any GitHub push; no such approval was
inferred from the local merge request.
