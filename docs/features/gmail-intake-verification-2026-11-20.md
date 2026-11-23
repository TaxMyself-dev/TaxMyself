# Gmail intake verification — 2026-11-20

Result: the tested functional scenarios pass after three corrections discovered by real DEV verification. This is not a claim that all possible documents, every existing queued item, production scheduling or accounting posting were exercised.

Base revision: 507defaf, existing codex/composio-email worktree, initially clean. User explicitly authorized real AI and Drive deletion ONLY for artificial documents in DEV Nagrut (Business id 5). No PROD, main integration, push or deploy. No schema changes or dependency/Node upgrades.

## Findings corrected

1. The legacy extraction prompt still enumerated form_106/tax_form/contract/unknown and an invoice-only response, while the appended Gmail policy demanded six different types. The first actual response contained six records but labeled the policy and licensing fee unknown, so strict parsing conservatively retained the file for manual review. gmail-six-v2 now builds one coherent Gmail request from the shared field definitions, with only the six relevant types and the decision envelope. The user-message trailer was corrected too. The legacy prompt for other channels remains unchanged, checked at the mocked SDK boundary. Parser criteria were not relaxed. A NEW artificial fixture was used after correction; the original response and history were retained.
2. An already-running INBOX consumer processed the artificial open replacement before the new worker claimed it. Its file was already in processed with an owned pending-review result, while the new ledger had no claim id and stopped READY. Recovery now reuses only an owned pending result with verified SHA-256 and matching prior MD5, without rewriting its extraction or making a new AI call. It is marked EXISTING_RESULT / UNCERTAIN for ordinary user review, not falsely presented as a new-policy verdict. Unknown PROCESSING claims are never blindly replayed. A file unexpectedly in processed cannot start a new claim without a safe prior record. No other worktree's process was stopped or reconfigured.
3. Destructive decisions previously checked ownership/tag/folder/references but did not recheck content bytes. The worker now verifies SHA-256 immediately before deletion and blocks CONTENT_CHANGED. Live verification changed only an artificial negative file to another artificial accounting PDF, proved no deletion, restored the original negative bytes, and only then confirmed normal deletion. Cached verified bytes are also reused for extraction instead of fetching the same input twice.

## Automated checks

Consolidated relevant backend run before the final version-label-only correction: **47 suites / 385 tests PASS**, 58.987 seconds. Exact PowerShell selection:

    $qaPaths = @(rg --files backend/src/email-intake backend/src/protected-pdf backend/src/document-import -g '*.spec.ts'); $qaPaths += @('backend/src/documents/email-ai-outcome.spec.ts','backend/src/documents/gmail-document-policy.spec.ts','backend/src/documents/gmail-extraction-prompt.spec.ts','backend/src/documents/documents-inbox-lock.spec.ts','backend/src/documents/documents-inbox-restore.spec.ts','backend/src/documents/inbox-ocr-cron.service.spec.ts'); $qaPaths += @(rg --files backend/src/integrations -g '*.spec.ts'); $qaPaths += @(rg --files backend/src/reports -g 'report-review*.spec.ts'); $qaRelative = @($qaPaths | Sort-Object -Unique | ForEach-Object { $_ -replace '^backend[\\/]','' }); npm --prefix backend test -- --runInBand --silent --runTestsByPath @qaRelative

After correcting the prompt label from gmail-six-v1 to gmail-six-v2, the two affected policy/SDK prompt suites passed again: 18 tests, 12.58 seconds. The 47-suite run and live fixtures were not repeated for that label-only edit; the running backend build predates only that label edit.

Coverage includes 300-attachment pagination/resume, duplicate identities, leases/cursor cycles, bounded processing, saved/unknown AI outcomes, strict negatives and malformed replies, all six document kinds, Composio read-only tools/account ownership/callbacks/attachment transport, protected replacement/idempotency, PDF subprocess crashes/limits/passwords, deletion references/content changes/unconfirmed acknowledgement, archive and existing approval rules. Tests use mocked external APIs or local artificial PDFs; console mock-failure logs are expected assertions, not real service failures.

Frontend: **13 tests PASS** with ChromeHeadless:

    npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.protected-pdf-spec.json --include=src/app/services/protected-pdf.service.spec.ts --include=src/app/pages/book-keeping/archived-documents/protected-pdf.spec.ts --include=src/app/services/document-approval-input.spec.ts --include=src/app/services/gmail-sync-state.spec.ts --progress=false

Backend build passed: npm --prefix backend run build. No frontend executable changes in this task; reused the prior successful production build at 59ab91de (hash 45ca0916bf780a97), rather than repeating the resource-heavy build. No full monorepo suite claimed.

Initial 37-suite/251-test and extra 8-suite/125-test checkpoints passed on the initial code; they are superseded by the consolidated final run. Intermediate diagnostics included a malformed mocked response delimiter, ENOSPC while writing Jest transforms, an ad-hoc read query using the fixture operation id instead of run id, and a Gmail search assuming the suggested subject spelling. Each was inspected; no pass was claimed for those failed commands. Only the previously approved exact Angular cache directory was cleaned to recover disk space. The actual email subject had one trailing L (KEEPINTAX-DEV-PUL), so the probe used recorded subject metadata instead of changing the provider. SDK upgrade notices were informational; no upgrade was performed.

## Bounded real DEV test

Harness: backend/scripts/qa/gmail-intake-live-dev-check.cjs. Uses real existing services, TypeORM repositories/transactions, the real 79-entry business catalog, AI SDK, Drive and Composio. It does NOT boot Nest, initialize schedulers or seed data. Constructor dependencies unused by the tested methods fail closed as empty placeholders; core extraction, ownership, catalog, persistence and storage methods are real. Protected reconciliation narrows the real selector to the one test operation. This is a service-level live integration test, not a full browser/session test.

The server's .env remained unchanged with PROCESS/DELETE/legacy OCR/nightly/protected dispatch false. Enabling AI/deletion happened only inside the isolated harness process, and only explicit recorded synthetic import ids could be passed to workers. A global worker tick is forbidden. Each fixture is checked against owner/business/run id/filename prefix/content hash; a second delete wrapper allows only the selected synthetic negative id/hash. The harness holds the existing automatic scanner lock for each bounded phase, releasing it in finally. No new real-mail scan is queued. Six extraction attempts were initiated by the harness (hard budget 6); the replacement had a prior result from an existing consumer, which was adopted without another request. This is an attempt count, not a billing audit.

Local private evidence operation: kit-e2e-1a41cdb0-448d-4656-b082-a38c6913cb89; synthetic run 41bbdcbb-c582-4843-ba2f-32f332ecbfd3. Manifest, exact input files, initial v1 result and assertions are in the operator-selected evidence directory, outside Git. No API keys, tokens, user passwords or raw responses are committed.

| Scenario | Import id | Observed result |
| --- | --- | --- |
| First diagnostic six-page PDF | 345 | v1 contract defect retained as UNCERTAIN/PENDING; fresh-process saved-result recovery made no second AI call |
| Artificial non-accounting story | 346 | Explicit valid negative; shared reference blocked deletion; confirmed Drive deletion; hidden from archive; tombstone dedup |
| Blank/unclear document | 347 | UNCERTAIN/PENDING, null amount/date and rejection reason, canResolve true; no special uncertainty note/tag |
| Password-protected original | 348 | Password-required detected before AI; retained after explicit replacement; REPLACED, no extra normal archive entry |
| Corrected six-page PDF | 349 | invoice, receipt, tax_invoice_receipt, insurance_policy, license_fee, credit_invoice; six ordinary pending-review records from one file; one extraction despite two concurrent workers |
| Open replacement | 350 | Same protected root/provenance; repeated replacement request reused its operation/file; existing owned extraction adopted without another AI request; one visible pending entry; operation reconciled SUCCEEDED |
| Changed-content negative | 351 | Shared reference blocked; changed bytes blocked CONTENT_CHANGED with no delete; exact bytes restored; only then confirmed deletion and dedup |
| Artificial PNG invoice | 352 | ACCOUNTING/invoice, one pending entry, one extraction |

Both negative files were verified absent using Drive metadata after acknowledged deletion. Two artificial reference rows were created/removed only to exercise the shared-file guard; no existing document/history was deleted. Original protected bytes remain retained. Other artificial positive/uncertain files remain for manual review, clearly prefixed kit-e2e. Do not approve them as real accounting transactions.

The real Composio probe searched only the known original artificial subject/filename, downloaded its exact PDF, compared content to the known input, and returned ALREADY_IMPORTED for original synthetic import 201 without creating another import. No Gmail send/change/delete or OAuth reconnection was performed.

Final real archive assembler assertions passed: every relevant type visible as PENDING, unclear inputs editable with missing fields still empty, negatives absent, one replacement visible and original not a second pending document. Actual service calls with an unrelated owner were rejected before reading/modifying the selected file. Existing imported-document state/identity signatures were unchanged. Every artificial extracted row had no confirmed expense; no expense approval or journal posting was requested.

## Reproducing safely

Set KEEPINTAX_QA_EVIDENCE_DIR to a private artifact directory and KEEPINTAX_QA_ORIGINAL_PDF to the known original artificial attachment for the Gmail probe. Run the harness only against its guarded keepintax-dev / integration 17 / business 5 target. Modes are explicit: --inspect (read-only), --stage (synthetic inputs), --interrupt (one result-storage fault), --add-six-v2, --process, --replace, --reconcile, --add-negative-v2, --delete-v2, --gmail-probe, --add-image, --verify. A manifest operation id is required for subsequent phases. Do not repeat destructive or paid phases blindly: the recorded result/state/attempt counters are authoritative, and the six-attempt cap is deliberate. --stage creates a new test manifest, not a new Gmail search. All mode names and exact execution evidence are retained in the task chat and private manifest.

## Current runtime and limits

Loaded the fixes only into the owned DEV backend 3002, with a process-ownership check and scanner lock during restart. Final root health HTTP 200; localhost:4202 HTTP 200 (frontend binds localhost/IPv6, so a direct IPv4-only frontend probe was not valid). Global PROCESS/DELETE/legacy OCR/nightly/protected dispatch remain false; synchronization and seeding remain disabled. No main merge, push or deploy.

The pre-existing non-synthetic workload was deliberately NOT sent to AI or deletion: 101 MOVE_PENDING, 32 BLOCKED_INVALID and 5 PASSWORD_REQUIRED records were present before and unchanged after the fixture exercise. Those 32 records were not certified as genuinely corrupt or revalidated here. Global queue activation requires a separate rollout decision; do not infer approval for processing existing customer documents from these synthetic tests.

No live accounting approval/journal posting, real-user OAuth reconnection, large paid corpus accuracy evaluation, cloud scale-to-zero wakeup or multi-host load test was performed. Saved-result restart was exercised with a new harness process and genuine DB state; unknown in-flight outcomes and provider failures were mocked. Shared MySQL lock behavior was tested with separate real worker connections, not by deploying multiple servers. Drive acknowledgement ambiguity and post-delete DB failure remain conservative/unconfirmed rather than falsely reported success. A content check immediately precedes deletion; it is not an atomic transaction against arbitrary external edits to Drive. The protected-PDF subprocess heap cap is not an OS-wide memory/security sandbox. These limits remain explicit; tested functional behavior is not a statistical guarantee of AI classification accuracy.
