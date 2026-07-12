## Purpose
Page for creating and managing SHAAM-compliant business documents (receipts, tax invoices, tax invoice-receipts, transaction invoices, credit invoices, price quotes, work orders) — including line items, payment details, drafts, PDF preview/generation, and the SHAAM allocation-number flow.

## Key entities/files
- `doc-create.page.ts` — main component: doc-type selection, general/user/payment forms, line items (add/edit/delete), totals calculation, draft save/load, PDF preview & create, allocation-number dialogs (manual + SHAAM OAuth), "opposite document" flow (e.g. credit invoice generated from a tax invoice).
- `doc-create-builder.service.ts` — builds form field configs, line-item table columns, summary rows, currency/card-company option lists.
- `doc-create.service.ts` — HTTP calls to backend `documents` module: doc indexes/settings, doc lines, create/preview/generate-pdf, rollback, drafts (save/load/delete), client CRUD.
- `doc-create.interface.ts` — `IClient`, section/field data shapes.
- `doc-cerate.enum.ts` (sic) — `DocumentType` enum + Hebrew display names, default doc-number start ranges, `LineItem`/`DocumentTotals`/`DocumentSummary` types, bank list.
- `doc-create.module.ts` / `doc_create-routing.module.ts` — Angular module wiring (PrimeNG dialog/table/etc.), routed at `/doc-create`.

## Main flows
- Select document type and issuing business; auto-fill/select recipient client (create/update/delete clients).
- Build line items with VAT/discount calculation, running totals.
- Configure payment details per method (bank transfer, credit card, check, cash, app).
- Save/load/delete drafts before finalizing.
- Preview PDF, create the document, and roll back a created document if needed.
- Manage allocation numbers: request manually via Israeli Tax Authority link/manual entry, or via SHAAM OAuth flow (`ShaamService`) for invoice approval.
- "Opposite document" flow: generate a related document (e.g. credit invoice) prefilled from a parent/source document, optionally closing the parent.

## Related topics
Backend: documents, clients, shaam
Frontend pages: my-account (entry point via "create document" dashboard card)
Frontend shared: select-client (via `SelectClientComponent` / `AddClientComponent`)
