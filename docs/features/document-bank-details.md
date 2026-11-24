# Bank transfer instructions on issued documents

Transaction invoices (חשבון עסקה) and tax invoices (חשבונית מס) always display
bank, branch, account number and beneficiary under "פרטי חשבון להעברת תשלום".
There is no checkbox. All four may stay blank; if any is filled, all four must be
nonblank. Partial input blocks preview/issuance and shows a group message.
Whitespace-only fields count as blank. Text preserves leading zeros.
Limits are 100/20/40/100 characters respectively.

The optional `docData.transferDetails` object is a document-owned snapshot stored
in nullable `documents.transfer_details` JSON. It survives draft restoration and
pending-allocation finalization. An entirely blank form sends null and omits the PDF section. Changing business or
document type and resetting after issuance clear the form. Other document types
reject supplied instructions. Existing documents have null instructions.

The preview, signed original and certified copy print an escaped RTL instruction
block 25 mm below totals, without a border, separately from received payments.
The heading and all four details stay in one section with print page-break
avoidance so the entire block moves to the next page if it cannot fit. Numeric identifiers use
LTR isolation. Instructions never create payment rows, record a payment, change
totals or journal behavior. Stored issued PDFs remain unchanged.

## Schema and rollout

Before boot/deployment, manually apply `document-bank-details.sql` to the intended
database. The same idempotent statement is appended to `../redesign/cutover.sql`.
No database was modified for this feature. The column is additive and nullable;
do not start a development backend against production to apply it. Remote PDF
rendering receives the extended model via the existing transport.

## Focused verification

Backend: `npm test -- --runInBand --silent --runTestsByPath src/documents/transfer-details.spec.ts src/documents/pdf/document-pdf.template.spec.ts src/documents/pdf/document-pdf-routing.spec.ts src/documents/documents-draft-issuance.spec.ts`, then `npm run build`.

Frontend: `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.doc-transfer.spec.json --include=src/app/pages/doc-create/doc-create-transfer.spec.ts --progress=false`, then `npm run build -- --configuration production`.

Manual acceptance: create/preview either supported type with leading-zero branch
and account numbers; clear all four fields; restore an OAuth draft; finalize an allocation;
switch business/type; review a long multipage PDF. Synthetic PDF fixtures require
no database, signing provider, or real banking data.
