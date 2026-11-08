## Purpose
Page for creating and managing SHAAM-compliant business documents (receipts, tax invoices, tax invoice-receipts, transaction invoices, credit invoices, price quotes, work orders) — including line items, payment details, drafts, PDF preview/generation, and the SHAAM allocation-number flow.

## Allocation requests

Persist the document as `PENDING_ALLOCATION` before supplier Approval.
`ALLOCATION_REQUEST_IN_PROGRESS` and `ALLOCATION_OUTCOME_UNKNOWN` are blocking
UI states, not retry prompts.

## Key entities/files
- `doc-create.page.ts` — main component: doc-type selection, general/user/payment forms, line items (add/edit/delete), totals calculation, draft save/load, PDF preview & create, persisted-document SHAAM allocation flow, "opposite document" flow (e.g. credit invoice generated from a tax invoice).
- `doc-create-builder.service.ts` — builds form field configs, line-item table columns, summary rows, currency/card-company option lists.
- `doc-create.service.ts` — HTTP calls to backend `documents` module: doc indexes/settings, doc lines, create/preview/generate-pdf, rollback, drafts (save/load/delete), client CRUD.
- `doc-create.interface.ts` — `IClient`, section/field data shapes.
- `doc-cerate.enum.ts` (sic) — `DocumentType` enum + Hebrew display names, default doc-number start ranges, `LineItem`/`DocumentTotals`/`DocumentSummary` types, bank list.
- `doc-create.module.ts` / `doc_create-routing.module.ts` — Angular module wiring (PrimeNG dialog/table/etc.), routed at `/doc-create`.

## Main flows

- Draft restoration scopes browser-session allocation context to the effective
  user's available businesses. Stale `draft_businessNumber` / `draft_docType`
  values from a previously viewed client are discarded, and a preferred
  document type falls back to the remaining draft-capable types. Persisted
  payment rows are normalized from the database's `paymentAmount` field to the
  frontend's `paymentSum` field, retain sequential line numbers, and immediately
  recalculate the payment total before the restored document can be issued.
- An allocation request is never sent for a mutable draft. The page first
  creates a `PENDING_ALLOCATION` document and receives its reserved final
  number; it then sends only that persisted identity to the backend. The
  backend saves the allocation before completing PDF/journal issuance.
- Select document type and issuing business; auto-fill/select recipient client (create/update/delete clients).
- Build line items with VAT/discount calculation, running totals.
- Configure payment details per method (bank transfer, credit card, check, cash, app). The desktop selector uses the current PrimeNG `Tabs` API; do not reintroduce deprecated `TabMenu`, whose PrimeNG 19 dynamic styles conflict with `Tabs`/legacy `TabView` based on load order.
  Saved desktop payments can be edited (pencil → "עדכן תשלום"/"ביטול") via `editingPaymentIndex`; mobile edits share `replacePayment`. `paymentLineNumber` is renumbered on delete.
- Save/load/delete drafts before finalizing.
- Preview PDF, create the document, and roll back a created document if needed.
  Preview rendering is platform-split: desktop browsers open a normal browser tab
  (`FilesService.previewFile3`), while mobile viewports and installed PWAs render
  the same Blob in-app via `components/pdf-preview-dialog` (pdf.js → canvas),
  because Chrome on Android never displays an embedded PDF inline.
  Desktop preview does not request a fixed-size popup. It uses the available
  browser window area; browser full-screen/F11 remains user-controlled.
- `documentRequestBusy` combines create, preview and persisted-allocation loading.
  Both action buttons are disabled while busy, and create/preview/pending-create
  entry points also reject overlapping calls. Each owning observable releases its
  loading flag via finalize, including synchronous payload errors through defer.
  Merely rejecting a confirmation does not release another request's lock.
- Desktop preview opens synchronously in the click handler and immediately writes
  an accessible RTL loading page through `services/pdf-preview-tab.ts`. Success
  replaces that document with the PDF viewer; failure leaves a static error with
  a close action and a toast, without upstream details. Blocked tabs fall back to
  the existing in-app viewer. Closed/navigated tabs do not strand the lock.
  FilesService opens a replacement document before writing the final viewer,
  attaches URL cleanup after replacement, and revokes the URL if writing fails.
- Focused request tests: `ng test --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.doc-preview.spec.json
  --include=src/app/pages/doc-create/doc-create-request.spec.ts --progress=false`.
- Manage allocation numbers: the above-threshold decision dialog starts SHAAM
  OAuth when needed. With a valid connection it persists the final pending
  invoice, requests allocation, and finalizes it as one user-visible action.
  Deferring leaves the same pending record resumable from the incomes page.
  Tax invoices and tax invoice-receipts at or below the applicable threshold
  may request the same flow voluntarily. This choice is off by default, requires
  a recipient business/tax number, and resets when document or business context
  changes; the mandatory above-threshold dialog and wording remain separate.
  The connection pre-flight redirects to OAuth only when the backend explicitly
  reports that no usable grant exists. Refresh/network/server errors show a
  retry/support message and never start another authorization. A tsandbox
  business outside the backend allowlist gets a dedicated demo-business message.
- "Opposite document" flow: generate a related document (e.g. credit invoice) prefilled from a parent/source document, optionally closing the parent.

## Related topics
Backend: documents, clients, shaam
Frontend pages: my-account (entry point via "create document" dashboard card)
Frontend components: add-client (`AddClientComponent` — opened via PrimeNG `DialogService` for "add new client", in both create and edit mode), input-autoComplete (`app-input-autocomplete` — the recipient picker that selects an existing client)

## Profile avatar
- The document-page header uses the application profile image with a fallback through `AccountImageComponent`. This image is separate from the issuing business logo used in PDF generation; document and payment editing flows are unchanged.

## Discount calculation

`calculateVatFieldsForLine` converts an INCLUDE discount to net in
`disBefVatPerLine`; `updateDocumentTotalsFromLines` aggregates that before-VAT
value rather than the gross `line.discount`. Synthetic 1180 incl VAT / 118
discount / 18% therefore produces a net discount of 100 and matching line and
document totals of 1062. EXCLUDE/WITHOUT continue to use the entered discount
unchanged. `doc-create-discount-audit.spec.ts` covers all three paths;
`tsconfig.doc-discount.spec.json` isolates its ChromeHeadless tests.
