## Purpose
Page for creating and managing SHAAM-compliant business documents (receipts, tax invoices, tax invoice-receipts, transaction invoices, credit invoices, price quotes, work orders) — including line items, payment details, drafts, PDF preview/generation, and the SHAAM allocation-number flow.

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
  document type falls back to the remaining draft-capable types.
- An allocation request is never sent for a mutable draft. The page first
  creates a `PENDING_ALLOCATION` document and receives its reserved final
  number; it then sends only that persisted identity to the backend. The
  backend saves the allocation before completing PDF/journal issuance.
- Select document type and issuing business; auto-fill/select recipient client (create/update/delete clients).
- Build line items with VAT/discount calculation, running totals.
- Configure payment details per method (bank transfer, credit card, check, cash, app).
  Saved desktop payments can be edited (pencil → "עדכן תשלום"/"ביטול") via `editingPaymentIndex`; mobile edits share `replacePayment`. `paymentLineNumber` is renumbered on delete.
- Save/load/delete drafts before finalizing.
- Preview PDF, create the document, and roll back a created document if needed.
  Preview rendering is platform-split: desktop browsers keep the popup window
  (`FilesService.previewFile3`), while mobile viewports and installed PWAs render
  the same Blob in-app via `components/pdf-preview-dialog` (pdf.js → canvas),
  because Chrome on Android never displays an embedded PDF inline.
- Manage allocation numbers: the above-threshold decision dialog starts SHAAM
  OAuth when needed. With a valid connection it persists the final pending
  invoice, requests allocation, and finalizes it as one user-visible action.
  Deferring leaves the same pending record resumable from the incomes page.
- "Opposite document" flow: generate a related document (e.g. credit invoice) prefilled from a parent/source document, optionally closing the parent.

## Related topics
Backend: documents, clients, shaam
Frontend pages: my-account (entry point via "create document" dashboard card)
Frontend components: add-client (`AddClientComponent` — opened via PrimeNG `DialogService` for "add new client", in both create and edit mode), input-autoComplete (`app-input-autocomplete` — the recipient picker that selects an existing client)
