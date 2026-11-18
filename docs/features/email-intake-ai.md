# Email intake: deterministic triage and single-pass AI

Implemented behind default-off `GMAIL_AI_REVIEW_ENABLED`. No live evaluation, mailbox import, AI call, schema application or user-data mutation was performed during implementation.

## Decision path

- Whole-word keyword rules apply equally to normal and glued multiword spellings. `חשבון מסחר` no longer matches `חשבון מס`; `taxinvoice` and legitimate Hebrew prefixes still match.
- Unsupported file types, clear inline assets and asset filenames stay deterministic exclusions. Asset matching now uses filename tokens rather than matching every occurrence of `temp` (which could reject legitimate filenames). An explicit accounting filename can override an asset-like name; an invoice subject alone does not rescue a file named logo.
- The old 20KB PDF / 80KB image cutoffs are removed. PDFs are checked for a minimum technical envelope and real PDF signature, then opened locally even when email metadata contains a keyword. Images smaller than 256 bytes without accounting evidence remain technical noise; other small images are not rejected for size alone.
- A local PDF result distinguishes EXTRACTED, NO_TEXT, PASSWORD_REQUIRED, FAILED, TOO_LARGE and UNAVAILABLE. Readable permission-restricted files are not labeled password-required merely because they contain encryption restrictions. Parser failure is not evidence of irrelevance.
- A readable file with accounting evidence follows normal import. A readable ambiguous file (scan, no accounting words or image without metadata evidence) is queued for the existing Drive AI path only with explicit opt-in. Encrypted/unreadable files are never sent to AI by this triage.
- New ambiguous admissions are limited to 10 per reader scan, 10MiB/file and 20 known PDF pages. Files beyond limits remain unresolved. Owner/business/content dedup is consulted before consuming the admission budget, so repeat imports do not permanently exhaust it on the same first ten already-imported files.

## Durable processing, not a second classifier call

Reader does not call Anthropic. Accepted ambiguous files use the normal DocumentImportService ledger/Drive path, appear in the existing durable inbox archive projection, then the existing claim/lock machinery invokes DocumentProcessorService once. Classification and full extraction share the same request and business catalog. The new AI envelope is enabled only for imported_documents source GMAIL; forwarding/manual/Drive/agent paths keep their old protocol.

The opt-in response must explicitly say accounting, not_accounting or uncertain. Accounting must contain a nonempty bounded list with supported document types and sane amounts. Malformed/contradictory JSON, unknown types, empty accounting results and truncated/abnormal stop reasons become uncertain. A provider timeout is not retried by this new request (45-second deadline, maxRetries=0); the existing processing claim records failure and retains the file.

- accounting: existing extraction output and review pipeline, no second AI extraction.
- not_accounting: retained extracted_document row with existing REJECTED status and readable automatic rejection reason; file retained in processed. Not reported as a technical AI failure.
- uncertain: retained ERROR storage status with ai_uncertain reason, displayed as נדרשת בדיקה in the archive with an explanatory detail. This reuses existing storage/workflow rather than introducing schema or a new lifecycle enum. Technical provider failures remain ERROR.

## Unresolved before import

When AI review is disabled, budget-limited or unable to open the PDF, the source attachment stays in Gmail; it is not falsely classified as irrelevant. Manual results include reviewRequired/aiReviewQueued/filteredAttachments per account, and the UI distinguishes imported/already present/intake skips/technical filtering/review required. Initial and nightly completion refuse to advance their cursor when reviewRequired is nonzero; the count is persisted in lastSyncError. Manual incomplete status also persists a bounded reason. These counters do not claim an AI call happened: already-imported files dedup, and queued Drive files can be processed later.

This is not the full password-protected-document workflow: no locked PDF is newly stored with a business PASSWORD_REQUIRED lifecycle and no replacement endpoint is implemented. Source-mail retention plus the non-advancing cursor prevents treating such a file as completed. The separate proposal is `password-protected-pdf-plan.md`, awaiting approval. A complete per-file review list for pre-import blocked files requires that durable lifecycle; current pre-import reporting is a persisted count plus bounded run-log examples.

## Configuration and verification

`GMAIL_AI_REVIEW_ENABLED=false` is in the example only. Ignored local secrets/configuration were not modified. The live DEV flag was checked to be disabled. Enabling it changes downstream Gmail AI output to the strict envelope; do not infer quality from mocked tests. A separately authorized small DEV sample is needed before enabling it broadly.

No branch of the AI agent was changed. No database schema is required for the implemented triage. Production delivery and integration/push/deploy remain outside authorization. See active task notes for exact commands, revision distinctions, test failures reviewed and passing final evidence.
