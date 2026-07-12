## Purpose
The core "add/edit expense (or income)" modal — a generic, column-config-driven form used everywhere a user manually adds or edits a transaction row, with category/sub-category selection, supplier selection, and receipt file upload.

## Key entities/files
- `modal.component.ts` — class `ModalExpensesComponent`, selector `app-modal`. `@Input() columns` (caller-supplied `IColumnDataTable` config drives which fields render), `@Input() data`/`editMode` (edit vs. add), `@Input() buttons`. Category/sub-category cascading lists via `ExpenseDataService`; supplier pick/creation opens `selectSupplierComponent` as a modal; file upload/preview (image or PDF, base64/Firebase-backed) via `FilesService`; multi-business support via `AuthService`.
- `modal.component.html`/`.scss` — dynamic form rendered from the `columns` config, file preview, footer buttons.
- `modal.component.spec.ts` — default Angular test scaffold.

## Main flows
- Add a new expense/income row (dynamic form from `columns`).
- Edit an existing row (`@Input data` prefills the form, including re-loading an existing attached file for preview).
- Cascading category → sub-category selection (equipment vs. non-equipment lists).
- Pick or create a supplier via the `select-supplier` modal.
- Upload and preview a receipt file (PDF renders via `DomSanitizer.bypassSecurityTrustResourceUrl`; images shown directly).
- Submit; caller (`ExpenseDataService.openModalAddExpense`) supplies the expense-specific column config and handles the result.

## Related topics
- Backend: expenses (`ExpenseDataService` categories/suppliers/save), documents (file upload/preview via `FilesService`)
- Frontend shared: select-supplier (opened for supplier selection)
- Frontend pages: my-storage (opens via `ExpenseDataService.openModalAddExpense`), and other "add expense" entry points (`app.component.ts`, `item-navigate` shared component) that go through the same service method
