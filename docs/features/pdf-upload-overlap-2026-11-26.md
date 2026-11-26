# Signed PDF upload overlap — 2026-11-26

Each original/copy upload starts as soon as its own signature resolves. Manual
issuance and allocation finalization share this pipeline. Both chains settle
before success or rollback. Failed rendering/signing/upload cleans successfully
uploaded siblings; cleanup failure preserves the original error. Cleanup remains
best effort. Serial signing remains supported without waiting for original upload.
No schema, template, accounting calculation, paid retry or email policy change.

## Full DEV before/after check

Baseline: `566daff5bd516221635ede69522103367e7869c5`; after: source fingerprint in
[sanitized evidence](pdf-upload-overlap-evidence-2026-11-26.json).
Chrome UI on 4204, backend 3004, standalone PDF 8082, keepintax-dev only.
Two transaction invoices and two cash receipts per variant, synthetic customer,
no email selected. Eight issued test documents / sixteen actual signing calls.
Each variant first used an unsigned preview to warm logo/rendering. Existing
parallel signing and 640px logo configuration were identical. No live SHAAM calls.

| Service creation time | Before | After |
| --- | ---: | ---: |
| Transaction invoice 1 | 4.287s | 3.890s |
| Cash receipt 1 | 4.701s | 4.310s |
| Transaction invoice 2 | 4.163s | 3.795s |
| Cash receipt 2 | 5.354s | 4.246s |
| Mean | 4.626s | 4.060s |

Observed mean improvement: 0.566s (12.2%). These are
server-side creation totals, not click-to-visible UI times. Four samples per
variant, run sequentially by variant, cannot establish a stable production gain.
Provider/network variation remains. No sample was removed.
Before receipt 2 timed out waiting for the UI success heading; the form reset and
server diagnostics contain completed COMMIT/release and 5.354s creation total,
but no HTTP-total event. It was not resubmitted. The other seven have HTTP 201
and observed UI success. We therefore compare service totals consistently for
all eight, without inventing the missing HTTP duration.
This change does not remove cold-start time. Live allocation-number issuance was
not exercised: the authorized exempt test business has no sandbox SHAAM issuer.
Allocation finalization routing is covered by focused tests; no external SHAAM
success claim is made. No new PDF visual verification was performed in this run;
templates and rendering code are unchanged.

## Controlled orchestration check

`cd backend; node scripts/benchmark-upload-overlap.cjs` — exit 0, 24 runs:
four timing scenarios, three repetitions, before/after alternated per repetition.
Actual orchestration methods with controlled render/sign/upload delays; no DB,
Chromium, provider, storage or mail I/O. Event timelines and raw results are in
the evidence file. This isolates scheduling benefit, not production latency.
Original-fast/copy-slow mean 578→474ms; copy-fast/original-slow 639.667→471ms;
little overlap opportunity 391→374ms; serial signing 542.667→442ms.

## Automated verification

From backend:
`npm test -- --runInBand --silent --runTestsByPath src/documents/pdf/document-pdf-upload-overlap.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/documents-draft-issuance.spec.ts src/documents/document-email-issuance.spec.ts src/documents/transfer-details.spec.ts src/documents/document-email-queue.spec.ts src/documents/document-email-scheduler.guard.spec.ts`

Exit 0: 7 suites, 99 tests, zero snapshots, 42.279s. Covers both upload orderings,
serial switch, render/sign/upload failures, draining pending work, cleanup failure,
transaction rollback, allocation routing and no queue dispatch before commit.
`npm run build` — exit 0 on final executable changes (subsequent changes only
added tests/docs). No broader suite rerun; unrelated behavior was not changed.
Backend remains in after mode, DEV queue active, unrelated schedulers disabled.
No production deployment, main integration or schema change in this increment.
