# Full DEV document issuance measurement - 2026-11-25

The UI reproduction confirmed the reported 10-20 second waits: the first baseline request took 24.974s, receipt 10.485s and quote 15.313s. Twelve real DEV test documents completed successfully (HTTP 201 and visible UI success), six per variant, with 24 new live signing requests. This is separate from the earlier authorized 24 synthetic signatures.

## Observed before/after results

| Scenario | Before repetitions 1 / 2 (s) | After repetitions 1 / 2 (s) | Warm repetition 2 reduction |
| --- | ---: | ---: | ---: |
| transaction-invoice | 24.974 / 9.176 | 13.378 / 6.307 | 31.3% |
| receipt-cash | 10.485 / 8.002 | 8.635 / 5.578 | 30.3% |
| price-quote | 15.313 / 7.640 | 7.370 / 6.295 | 17.6% |

Both matched repetitions improved for all three types. Repetition 1 transaction invoices began with freshly started backend/PDF service processes in both variants; repetition 2 used a warm PDF service. Do not combine those as one steady-state claim. Only two samples per type/variant were measured; these are observations, not a percentile estimate, production SLA or proof that every improvement came from this code.

The chronological blocks were before-1, after-1, after-2, before-2, limiting a simple all-before/all-after time-order bias. Same business/logo, synthetic customer, one identical ILS 10 line, document date and unchecked email option; receipts add one matching cash payment. Transaction invoices leave optional transfer instructions blank. Exact request-level diagnostics and stage durations are in [sanitized evidence](evidence/document-generation-dev-e2e-2026-11-25.json).

## What accounts for the delay

- Baseline logo downloads: 1.331-3.137s on every issuance. After initial 2.547s download, all five cache hits measured 1-2ms. This is a directly observed mechanism behind the gain, not simulated storage latency.
- First baseline transaction invoice: shared prepare/render/sign pair 21.131s, upload pair 2.926s. Original render 5.810s, copy render 2.407s, original signing 3.926s and copy signing 8.084s. Original signing already overlaps copy rendering before the optimization. Nested timings overlap and must not be summed into the HTTP total.
- Real SQL query durations totaled 0.338-0.836s per request; cash receipts made 36 queries versus 20 for transaction invoices/quotes. Receipt journal stage was included. Query timing sums are diagnostic totals, not necessarily a wall-clock critical path.
- Real signing, storage uploads and Chromium still vary. Parallel signing only helps when the original signing is still running when the copy becomes ready; the cache benefit must not be attributed to signing concurrency.
- No email was sent and the queue stayed disabled. These results establish no real outbox delivery speed/reliability claim.

## Boundaries and source revisions

Frontend http://localhost:4204, backend http://localhost:3004 (bound to 127.0.0.1), standalone PDF http://127.0.0.1:8082. Real existing DEV Firebase authentication/storage and FillFaster were used. Database was asserted keepintax-dev, synchronize=false, boot seed/scheduled tasks/billing jobs disabled. No schema SQL was executed. User explicitly authorized additional DEV documents/signatures as needed for quality testing, synthetic customer and no email.

Worktree application HEAD: f147ff14. Before mode transpiles the exact DocumentsService and ImageStorageService from c46490a71dca24ca07250b1ae9233047b72b4a41 at their normal CommonJS load points; it asserts both replacements and absence of parallelSigning in generatePdfPair. After uses the built optimized services from bd2476be39e6f2ee9a1f39a7dd21ee3537579b93 (unchanged product sources at f147ff14). All other application dependencies stay current in both modes. This is an isolated service-source comparison in the full current application, not a full historical deployment test.

SQL instrumentation stores request UUID, variant, success and elapsed time only, never queries/parameters/rows. All evidence here excludes business/user identifiers, document content, tokens and raw application logs. Local launch overrides and private artifacts remain ignored. Other worktrees, main and existing unrelated services were not changed. Final local backend is restored to after mode; no main integration, push or deployment.

## Output verification and separate checks

Downloaded one optimized transaction-invoice original through its success-dialog download button. The browser download-wait API timed out, but the actual downloaded file was found and independently checked: one page, 1,387,807 bytes, PDF header, signature ByteRange/Contents envelope, expected document number, ILS 10.00 and synthetic DEV marker. It was rendered locally and visually inspected: readable RTL text, logo, table, amount and footer, without visible clipping/overlap. No cryptographic certificate trust validation is claimed. Original and copy signing stages succeeded in all twelve requests; individual downloads/content checks for all 24 files were not performed.

### Allocation-number scenarios

Full UI live allocation was **not executed**: authorized business is VAT-exempt and its form offers receipt, transaction invoice, quote and work order, not tax invoices. SHAAM defaults to TSANDBOX and the implementation restricts that flow to its dedicated test issuer. No business identity/VAT status or sandbox guard was changed, no Tax Authority request was made and no allocation number was invented in an existing DEV record. Earlier synthetic allocation-finalization and multipage allocated-PDF tests remain separately documented in [the isolated benchmark](document-generation-speed-benchmark-2026-11-25.md); they do not substitute for an end-to-end sandbox allocation test. A full allocation comparison still requires the dedicated sandbox issuer/account flow.

### Email/outbox scenarios

Email checkbox was off throughout. The new queue SQL was authorized for preparation only and remains unapplied; no real persistent queue/restart/retry integration test was possible in this run. Previous unit and simulated failure-path evidence remains applicable to unchanged code.

## Commands, setup and limitations

- Restored existing ignored local launchers after services had stopped; no completed new-run diagnostic existed beforehand. Before source loader validation and HTTP health were checked before issuing test documents.
- From pdf-service: npm ci --no-audit --no-fund (80 packages), npm run build (exit 0). Runtime used Node v24.13.0, which produces an engine warning against declared Node >=22 <23; this Windows DEV result does not verify the production Node 22 image. Frontend also uses an existing dependency engine mismatch noted during setup.
- Frontend command: node frontend/scripts/start-local.js --no-open. Backend: node .local-ai-dev/start-document-e2e-backend.cjs, changing only ignored document-test-mode.json between blocks. PDF: node scripts/dev.cjs from pdf-service. Processes started hidden; only verified task-owned processes restarted. PDF service restarted before the first after block to match cold-service setup; later PDF service remained warm.
- Initial PDF launch failed because dependencies and dist template were missing; install/build repaired it before any issuance. Transient ECONNRESET appeared around after-server startup; health became 200 before its first issuance. Expected frontend connection banners during deliberate backend restarts were excluded. Browser debugger disconnects, partial typing and download-wait failures extended operator time; state was inspected before continuing and no create-confirm was blindly repeated.
- No executable product change was made during this run. Existing 7 suites / 96 tests and Nest build evidence are reused for unchanged source; a new full suite was not rerun merely for evidence/docs. Local PDF build, 12 actual UI successes and evidence assertions provide new validation. This is no claim of final-main or deployed verification.
