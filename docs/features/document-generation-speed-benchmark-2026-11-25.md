# Document generation before/after measurement — 2026-11-25

Measured source revisions: before `c46490a71dca24ca07250b1ae9233047b72b4a41`, after `bd2476be39e6f2ee9a1f39a7dd21ee3537579b93`.
The after application source was unchanged during measurement; only diagnostic scripts/docs were added.

## Actual FillFaster signing, isolated application boundaries

Exactly 24 authorized synthetic signature requests succeeded, no retries: three scenarios, two original/copy files, two variants, two repetitions.
Actual createDoc/finalizeAllocation/model preparation and local Chromium were used. Database, upload, logo storage and mail remained isolated simulations.

| Scenario | Before mean (s) | After mean (s) | Reduction | Faster pairs |
| --- | ---: | ---: | ---: | ---: |
| receipt-no-allocation | 2.793 | 2.739 | 1.9% | 1/2 |
| allocation-finalization | 2.491 | 2.367 | 5.0% | 1/2 |
| multipage-allocation-logo | 4.655 | 3.448 | 25.9% | 2/2 |

The large allocated document improved in both pairs. Short-case differences are small relative to run-to-run ranges; no consistent ordinary-issuance speedup is established.
Original signing already overlaps copy rendering in the baseline. When that signing finishes first, allowing copy signing in parallel cannot shorten that segment.

## Controlled local matrix

Real Chromium, ten scenarios, three repetitions per variant (60 timed successful runs). Controlled simulated signing/storage/mail latency, not production totals.

| Scenario | Before mean (s) | After mean (s) | Reduction | Faster pairs |
| --- | ---: | ---: | ---: | ---: |
| receipt-no-allocation | 1.702 | 1.712 | -0.6% | 1/3 |
| invoice-no-allocation | 1.712 | 1.597 | 6.7% | 2/3 |
| allocation-finalization | 2.151 | 1.622 | 24.6% | 3/3 |
| allocation-with-logo | 2.298 | 1.684 | 26.7% | 3/3 |
| multipage-allocation-logo | 2.353 | 1.553 | 34.0% | 3/3 |
| receipt-email-compatible | 2.342 | 2.141 | 8.6% | 3/3 |
| receipt-email-queued | 2.452 | 1.511 | 38.4% | 3/3 |
| warm-logo-preview | 0.604 | 0.481 | 20.3% | 3/3 |
| cold-browser-receipt | 2.480 | 2.703 | -9.0% | 2/3 |
| tax-invoice-receipt-payment | 1.750 | 1.450 | 17.1% | 3/3 |

Negative reduction values mean the after variant was slower in that sample; they are retained. The queue row measures opt-in creation-response latency, not completion of email delivery.

## Behavior and output checks

- All 24 live signed outputs had complete PDF signature envelopes and parsed into pages; synthetic content and allocation-number presence were verified. Certificate trust was not tested.
- Eight before/after failure checks passed: signing quota rejection, partial upload, corrupt image and unresolved allocation. None committed or sent mail; corrupt images failed before signing; unresolved allocation failed before rendering.
- Queue-on after runs performed no PDF redownload or synchronous SMTP, and dispatched only after the simulated commit. Warm logo previews performed no storage download.
- No live document numbering, DB writes/DDL, tax-authority requests, cloud service inspection, upload, SMTP, main integration or deployment.

## Limits and reproducibility

- Real Chromium and real before/after orchestration; no real DB/storage/mail/SHAAM or Cloud Run.
- Live signer table: only 2 paired repetitions per scenario, not a statistical significance or p95 claim.
- Live cases retained up to 6 browser instances over the three cases. Do not infer precise production speedups.
- Initial live baseline includes the first provider connection; later paired order alternates.
- Final controlled local run is bounded to two comparison browsers and alternates order; 3 repetitions per scenario.
- Controlled local sign=500ms, logo storage=120ms, each upload=100ms, SMTP=500ms, business lookup=5ms; these are assumptions.
- Queue-on comparison uses enqueue/commit/kick spies. It is not a MySQL durability/scheduler integration test; table remains unapplied/queue disabled.
- Allocation cases use a stored synthetic number. Actual tax-authority allocation request time is excluded.
- PDF checks validate envelope presence/page parsing/content, not cryptographic certificate trust.
- Preliminary local runs were interrupted after detecting accumulated browser resources; their results are preserved separately and excluded from final local summary.

Harness: [benchmark-document-generation.cjs](../../backend/scripts/benchmark-document-generation.cjs).
Sanitized raw timings/counters, per-pair ranges, PDF checks and source hash: [evidence JSON](evidence/document-generation-speed-2026-11-25.json).
Synthetic PDFs and the signing request ledger are retained under the ignored local `.test-tmp/document-speed-2026-11-25/` directory.

Commands from `backend/`:

```powershell
node scripts/benchmark-document-generation.cjs --live=diagnostic
node scripts/benchmark-document-generation.cjs --live=remaining
node --check scripts/benchmark-document-generation.cjs
node scripts/benchmark-document-generation.cjs
node scripts/summarize-document-generation-benchmark.cjs
```

All final commands exited 0. Live phases consumed 4 then 20 calls. Do not rerun paid phases: the fixed ledger rejects reuse/over-budget calls.
Two preliminary local invocations exited 1 after intentional interruption; the second preserved measurements as `local-preliminary-resource-diagnostic.json`.
Final local harness hash: `59ee2faee09f0c1c71c51ee9e60d31d90e591fbcd66536e0426eec4413c49ebd`. The live phases preceded resource-window refinement and must not be described as a single final-harness run.


## Regression checks and diagnostic corrections

From `backend/`:

```powershell
npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/document-pdf-routing.spec.ts src/documents/pdf/fillfaster-signer.service.spec.ts src/documents/transfer-details.spec.ts src/documents/document-email-issuance.spec.ts src/documents/document-email-queue.spec.ts src/identity-images/image-cache.spec.ts src/identity-images/identity-images.spec.ts
```

Exit 0: 7 suites / 96 tests passed in 44.524 seconds, zero snapshots. Node syntax
checks on both new diagnostic scripts and `git diff --check` passed. No application
executable code changed during this task, so the already-passing Nest build on
`bd2476be` was reused; it was not rerun merely for scripts/evidence/docs.

The first PDF verification command exited 1 because its filename classifier
matched `allocation` inside `no-allocation`. Review identified a verifier mapping
error, not missing allocation text in an allocated PDF. The classifier was fixed
to exclude `no-allocation`; the same required allocation-content assertion then
passed on all allocated outputs. No PDF was regenerated, no snapshot was replaced
and no extra live signing requests were made.

For future reruns, build the application first to provide current compiled code
and bundled fonts. Do not run live phases again without a new explicit budget;
the existing fixed ledger has reached the approved ceiling of 24. Local runs use
only simulated signing even though the ledger still records prior live calls.
