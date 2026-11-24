# Manual document-processing retry

Owners can retry a blocked document from its archive row, select up to 100 document files, or retry every blocked document of one connected mailbox from Settings > Permissions and accounts. The mailbox action scans all historical WORK_BLOCKED imports for that exact owner/integration in sequential pages of 100. Partial results report why some files were left untouched. Password-protected files retain their separate open-copy replacement action.

## Server boundary

- POST /documents/me/retry-processing accepts { businessNumber, fileIds } with 1–100 Drive identities. The business header follows existing archive requests. Tenant and business ownership are rechecked on the server.
- POST /integrations/email/:integrationId/retry-processing accepts an optional numeric cursor. Responses contain results, retried, skipped, and an optional nextCursor. The client follows pages to completion.
- Both endpoints reject delegated/admin-impersonated mailbox/document retries. Existing document entitlement guards still apply to the document endpoint.
- Missing capacity settings or provider credentials fail before releasing any document. Provider/model/quota group on existing jobs remain frozen; incompatible jobs require operator attention.
- Retry takes the same per-business MySQL advisory lock used by inbox intake, then locks the import, all non-form-fill jobs for the file/content, and extracted claims in a transaction. Claims remain bounded to owner/business/file. A live claim or queued/in-flight job is not duplicated.
- Never-sent work returns to READY, or a safe existing blocked job returns to READY. There is no inline provider call and no new identity to evade queue deduplication.
- Saved results resume persistence through RESULT_SAVED without a second provider call. Existing pending-review extraction is reused only with matching Drive MD5 and no ambiguous competing attempts. Extracted accounting/review fields are not rewritten by retry.
- UNKNOWN, paid attempts without durable results, error/processing claims without safe results, deleted/approved/rejected/archived records, protected PDFs, foreign/missing files and cross-worker runs are retained for manual attention. Current sender blocking rules are checked again.
- A requeued import clears the bounded retry counter/error/backoff and refreshes its originating run summary after commit. Existing run identities and scan cursors remain intact. A repeated click is idempotent.

## UI selection

Archive checkboxes use itemType + id as their selection identity so expense/document/transaction ids cannot collide. The shared table still defaults to id for all existing consumers. Successful retry clears both mobile and desktop selections. Progress and per-outcome feedback are announced through role=status; controls prevent repeated requests while busy.

## Verification and deployment

No schema, external-provider contract, production configuration, or accounting changes. No live import/AI calls are required to validate this feature. Use the isolated backend policy/service/controller suites, archive projection tests, the dedicated frontend tsconfig with explicit include selectors, and both package builds. The rendered mailbox tests exercise 375px and 1100px controls.

Integration into main, GitHub push and deployment require Elazar's separate approvals. Updating configuration alone does not release previously blocked rows; an owner must explicitly request retry through the new controls.

Mailbox status polls recompute derived run state, including latest runs that reference older documents as duplicates. A successful retry therefore updates the warning/progress even when the original import belongs to another historical run.
