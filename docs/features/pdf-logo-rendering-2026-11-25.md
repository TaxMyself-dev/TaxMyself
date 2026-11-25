# PDF logo rendering optimization - 2026-11-25

## Result and implemented change

The follow-up addresses actual document rendering, separately from startup warmup. All twelve full DEV UI issuances succeeded (HTTP 201 and visible success), two repetitions of three types in each variant, 24 new live signatures. Mean original+copy renderer time fell from 1.804s to 1.212s (32.8%). Each optimized pair measured 0.967-1.544s. Warm-logo full issuance averaged 5.843s -> 4.614s (21.0%, five requests per variant). All-request mean including first cache misses was 6.252s -> 5.117s. These are small-sample observations, not a percentile/SLA or a claim that all overall savings came from rendering.

Document model preparation requests the new 'pdf' image-download purpose. That variant decodes, validates, rotates, center-cover crops and downsizes to at most 640x640 PNG, preserving alpha and never enlarging small inputs. This matches the template's existing center-cover circular 38mm logo. At the full 640-pixel dimension this is approximately 428 pixels/inch at that printed size. Uploaded originals, existing stored logos and ordinary logo/profile downloads keep their existing sizing and appearance policy; no stored asset is rewritten.

Original and PDF variants have distinct keys within the SAME 32MiB/128-entry/ten-minute cache and bounded in-flight dedup map, so serving a PDF never poisons an original-image request or doubles the configured memory budget. Replacement UUID paths still invalidate by identity lookup. No new database/schema/credential/runtime dependency, renderer page reuse, concurrency increase, template layout or signing changes.

## Full DEV UI before/after

Times below are seconds. Render pair is ORIGINAL_RENDER + COPY_RENDER (the two renders run sequentially), excluding signatures/uploads/DB/logo download. Full time is backend HTTP receive-to-response-finish, excluding form filling, browser-control overhead and later downloads. Nested/parallel sign/upload spans must not be added again to total.

| Scenario | Before render repetitions 1 / 2 | After render repetitions 1 / 2 | Before full repetitions 1 / 2 | After full repetitions 1 / 2 |
| --- | ---: | ---: | ---: | ---: |
| transaction-invoice | 1.472 / 1.729 | 1.300 / 1.010 | 8.297 / 5.736 | 7.627 / 4.573 |
| receipt-cash | 1.652 / 2.389 | 1.278 / 1.544 | 5.184 / 6.685 | 4.876 / 5.182 |
| price-quote | 1.447 / 2.132 | 1.172 / 0.967 | 5.244 / 6.365 | 4.222 / 4.219 |

Sequence: before-1, after-1, after-2, before-2. Same real DEV business/logo, synthetic customer, ILS 10 single line, no email; cash receipt has a matching cash payment. Optional bank transfer instructions blank. In both variants the PDF service stays warm and parallel signing/cache/startup-warmup implementation remains unchanged. Baseline is bfe8baac, immediately before PDF-logo optimization, NOT the older pre-cache/pre-parallel code.

First transaction invoice per variant had an empty backend image cache: baseline logo 2.473s, optimized 2.938s. Those two requests are excluded only from the explicitly labeled warm-logo aggregate, not dropped from evidence. Before the second baseline transaction invoice, one real unsigned UI preview warmed its logo cache after a backend restart; it is recorded separately and excluded from issuance aggregates. Both second transaction invoices therefore have warm logo/PDF service. Every matched type/repetition improved in render and full time, but provider and machine load varied. Signature averages must not be interpreted as a causal effect of this image change without larger controlled sampling.

Before mode uses the exact historical DocumentsService and ImageStorageService loaded at their normal module positions from bfe8baac; all other code/dependencies remain current. Startup asserts both replacements and baseline logo-call shape. After uses built current candidate; source fingerprints are recorded in [sanitized evidence](evidence/pdf-logo-rendering-2026-11-25.json). This is a two-service source comparison in the current full app, not two complete historical deployments. Server 3004 is bound to loopback; frontend 4204, standalone PDF 8082. DB keepintax-dev, synchronize/seed/scheduled/billing tasks disabled, outbox off. No unrelated process/worktree, main, production, schema SQL or deployment was changed. Backend is restored to optimized mode and healthy at finish.

## Isolated rendering and file checks

Extended the existing synthetic renderer harness with --logo-size and --pdf-logo. Two repetitions of short no-logo, large-logo and 55-row allocated-marker original/copy pairs produced 24 local PDFs total. Both sides use the unchanged warmed real Chromium service renderer. Optimized logo is produced by the ACTUAL built ImageStorageService.normalize; no Firebase app/DB/provider request is made. It requires npm run build in backend first. The synthetic allocation string is layout/content only, not a Tax Authority allocation.

On the 1024-square deterministic raster stress input: PNG bytes 3,147,780 -> 1,147,530, one-time variant preparation 250ms. Sample unsigned PDF 3,169,100 -> 1,167,249 bytes. Original+copy with logo: 2.577 / 1.862s before -> 0.936 / 1.049s after; allocated multipage: 1.968 / 1.872s -> 1.232 / 1.284s. The no-logo control also varied (1.017 / 0.774s -> 0.759 / 0.707s), indicating time-order/machine-load noise; size reduction is deterministic, timing differences must not all be attributed to resizing. Full UI reversed blocks supplement these bounded diagnostics.

All 12 optimized synthetic PDFs match their baseline extracted text and page counts exactly, including no-logo, original/copy and allocation marker/multipage. First pages of logo and multipage originals were rendered and visually inspected. A real optimized DEV original and copy were downloaded through their success-dialog buttons, opened/rendered, and checked for correct expected document number, amount, DEV marker, one-page count, 640x640 embedded logo and ByteRange/Contents signature envelope. Both look legible with intact circular logo, RTL heading/table, original/copy marker and footer. Sizes 759,876 / 759,972 bytes. Cryptographic certificate trust was not tested; stored originals were not modified. Private PDFs/images/logs remain ignored; tracked evidence contains no business/customer identity, content or credentials.

## Checks, exact commands and limits

From backend (final executable source unchanged between passing batches):

```powershell
npm run build
npm test -- --runInBand --silent --runTestsByPath src/identity-images/image-cache.spec.ts src/identity-images/identity-images.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/pdf/document-pdf-renderer.service.spec.ts src/documents/pdf/document-pdf-client.spec.ts
npm test -- --runInBand --silent --runTestsByPath src/documents/documents-draft-issuance.spec.ts src/documents/transfer-details.spec.ts src/documents/document-email-issuance.spec.ts
```

Build exit 0. First passing batch: 5 suites / 69 tests, 21.25s. Additional issuance/allocation-finalization/email regression batch: 3 suites / 32 tests, 27.134s. Total 101 tests passed, zero snapshots. Initial focused run had one stale routing mock expectation (new 'pdf' argument) while 45 tests passed; inspected failure and updated the expectation explicitly, then passing batch above. No acceptance threshold was weakened. Other initial command-output path mistakes were corrected; no failed run is counted as passing. Existing 27 standalone-service tests/build/layout smoke from bfe8baac are reused because service executable/template did not change in this follow-up. Full backend suite, production Linux/Node22 image and deployment not tested; local Node24 engine mismatch remains.

From pdf-service:

```powershell
node scripts/benchmark-startup.cjs --warmup --logo-size 1024 --output ../.test-tmp/pdf-logo/before
node scripts/benchmark-startup.cjs --warmup --logo-size 1024 --pdf-logo --output ../.test-tmp/pdf-logo/after
```

Evidence integrity, local links, git diff --check and benchmark syntax checked. No rerun of paid signing outside the twelve approved DEV documents, and no extra signing retry. UI delayed form initialization was inspected/resumed without duplicate confirmation. No emails or live SHAAM requests. The real allocation-number sandbox issuer and unapplied email-outbox SQL remain separate unverified integration boundaries, as in previous reports; unit/synthetic allocation coverage does not replace a live sandbox flow.

The remaining first-issuance delay is mainly a cache-miss storage fetch plus variable signing/upload/DB costs. It measured 7.627s after, despite only 1.300s of PDF rendering. This change reaches the proposed <=2s pair-rendering target in these samples, not a guaranteed <=5s end-to-end result for every request. No cloud minimum instances or billing settings changed.
