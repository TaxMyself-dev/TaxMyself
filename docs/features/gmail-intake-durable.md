# Durable Gmail intake

Implemented on codex/composio-email, based on 7ae55357. Runtime activation and database application are NOT part of this delivery. No user data or files were changed during implementation.

## Runtime boundaries

All four new flags default false; see backend/.env.gmail-durable.example. The real local environment was not changed. ENABLED gates every new-table query, SCAN gates downloads, PROCESS gates extraction, and DELETE gates physical deletion. Do not enable ENABLED before separately approving and applying docs/features/gmail-intake-durable.sql. The same prepared block is appended to docs/redesign/cutover.sql, not an extra migration to apply twice. Do not use TypeORM synchronization to apply it. Verify actual target document_type storage first; if ENUM, separately prepare an extension preserving every value. No database was queried to verify its current column type.

Activation must be a separate controlled DEV exercise: approve schema, verify separate DEV credentials/storage, then enable only the stages authorized for synthetic fixtures. Existing nightly-sync and protected-PDF dispatch controls remain independent. Enabling PROCESS authorizes real AI for due work, not only the newest test document. Enabling DELETE authorizes real exact-file deletion for all eligible due work. Neither was activated here.

## Flow and persistence

EmailIntakeRunsService creates one owned business-scoped frozen run. Default manual query covers all attachments in a fixed 90-day window; initial import uses the validated selected range; nightly runs use the existing cursor overlap. All three paths use durable pagination when enabled and bypass the legacy 10/25 and ambiguous-10 scan limits. Legacy diagnostic APIs are unchanged. Business resolution happens once at run creation; this does not implement mailbox-to-business settings.

email_import_runs persists query, page cursor/history, leases, pull/processing states and counters. email_import_items records each message and MIME part path before advancing a page, including technical skips, retries, duplicate links and source metadata. A source-cache hit in the same owner/business/integration avoids downloading an already registered MIME part. SHA-256 in the existing imported_documents ledger remains the content identity across sources. Attachment IDs are fetched fresh rather than used as durable identity.

Staging is a child of EACH BUSINESS folder, not one shared tenant-wide folder. The existing ledger reserves a unique owner/business/hash row before upload; tagged uploads can be found after a partial failure and are accepted only after hash verification. Only a registered file can move from staging to INBOX. Technical invalid/oversize PDFs remain blocked, never negative. Transfers over the existing 10 MiB safety limit require manual handling; unsupported formats are counted as skipped.

Scan concurrency is one distributed named MySQL lock with at most two downloads at a time. Processing uses two global distributed slots plus the existing business OCR lock. A batch is bounded, but the persisted pending records continue on later ticks. Connection cleanup releases locks even after failures. Five failed item/work attempts stop in an attention state rather than disappearing or retrying forever.

New processing excludes managed files from the old generic INBOX scanner. It reuses DocumentsService, its catalog and persistence normalizer, and DocumentProcessorService. The six accepted types are invoice, receipt, tax_invoice_receipt, insurance_policy, license_fee, credit_invoice. One AI response makes the decision AND extracts data; no preliminary paid classification. Keyword/name matches do not prove accounting relevance. Readable supported ambiguous files reach this same processing path.

The work lifecycle is STAGING -> MOVE_PENDING -> READY -> AI_PREPARED -> AI_IN_FLIGHT -> RESULT_SAVED -> MOVE_PROCESSED -> AWAITING_APPROVAL. Claims and saved results are fenced by lease tokens and database transactions. Saved extraction is reused after a crash. If the server dies with an unknown AI outcome, the document becomes ordinary manual pending without blindly repeating the paid call. This trades automatic recovery of unknown extraction details for protection against duplicate calls; exactly-once external AI cannot be guaranteed.

Uncertain results use ordinary PENDING_REVIEW with no special note/tag. Missing amount/date stay empty; the existing approval dialog requires the user to fill them. The server rejects missing amount/date at cash approval. Insurance policies/licensing fees use the existing expense-document approval route and do not automatically create an expense or claim VAT. Existing accounting approval rules still apply.

Password-required PDFs use the existing protected-document/replacement workflow. A replacement inherits the managed run; the original becomes REPLACED in the work ledger while the protected original and audit history remain. The run counts the replacement rather than two independently pending documents. Management is reserved as PROTECTED_DELIVERY before the external INBOX move, closing the old-scanner handoff race.

## Deletion and recovery

Only a complete strict valid explicit not_accounting response with an empty invoices array allows DELETE_PENDING. An empty array alone, invalid JSON, truncation, timeout, an unreadable PDF, or uncertainty never authorizes deletion. The original Gmail message is untouched.

Before each deletion the worker checks source, policy version, saved raw decision, owner/business, upload operation tag, exact single folder parent and all known shared file/expense/protected references. Approval checks the disposition inside its transaction, so a negative file cannot become a new accounting link during deletion. Referenced files stop at DELETE_BLOCKED.

Only an acknowledged Drive delete is recorded as DELETED; 404 is DELETE_UNCONFIRMED. Transient errors retry with a bounded budget. A lost acknowledgement or DB failure after Drive deletion does not falsely report success and can require operator reconciliation. Do not blindly restore or re-run such records.

After acknowledged deletion, raw response, source header metadata and filenames are scrubbed; the scoped hash, minimal decision/version/time, source identity and processing identifiers remain as a tombstone. Repeated imports hit the tombstone and do not upload or process again. Negative files are hidden from ordinary archive rows even while deletion is pending/blocked. Their status remains visible in the existing Gmail run summary. Other sources/businesses/users are not deleted by hash matching.

## Operational limits and verification

Pull completion is independent from processing completion. A persisted integration_finalized_at acknowledgement lets a completed scan reconcile the integration cursor/status after a crash, without downloading or extracting the same files again. The existing Gmail settings page shows both phases and persisted message, attachment, duplicate, technical-skip, pending, password, deletion and failure counters. Archive/approval screens are reused; no new approval queue or screen was added.

Nest cron ticks require a running server. A platform that scales to zero needs a separately configured and authorized wake-up mechanism before production readiness. No infrastructure or deployment settings were changed. Do not switch back to the legacy scanner while managed files are in flight without a reviewed drain/reconciliation plan.

Offline tests cover a 300-attachment multi-page scan with restart, deduplication and at most two concurrent downloads; stale leases/cursor cycles; default-off no-I/O; no repeat AI for saved/unknown outcomes; strict deletion and shared-reference guards; existing import/protected-PDF/accounting paths; empty-field manual approval and UI polling. Actual SQL application/transaction behavior, live Composio pagination, Drive operations, real AI and browser end-to-end validation remain deliberately unexecuted and require separate approval.
