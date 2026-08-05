## Purpose
Ionic modal for classifying a bank/card transaction into a category — either an existing category/sub-category or a newly-defined one (recognized or not-recognized, income or expense mode).

## Key entities/files
- `add-transaction.component.ts` — `@Input() data` (the transaction), `@Input() incomeMode` (setter swaps titles/validators between income and expense wording). Four `FormGroup`s: existing-category, new-category-recognized, new-category-not-recognized. Loads category/sub-category lists via `ExpenseDataService.getcategry()`/`.getSubCategory()` (equipment and non-equipment lists merged with a visual separator). Submits via `TransactionsService.addClassifiction()`.
- `add-transaction.component.html` / `.scss` — form markup.
- `add-transaction.component.spec.ts` — default Angular test scaffold.

## Main flows
- Existing category: pick category → sub-category (from combined equipment/non-equipment list) → submit classification.
- New category: define a brand-new category/sub-category inline, with recognized-vs-not-recognized and equipment sub-forms, then submit.
- Single vs. bulk update toggle (`isSingleUpdate`).

## Related topics
- Backend: transactions, expenses (category/sub-category data via `ExpenseDataService`)

## Note
This component appears currently unused: `AddTransactionComponent` is imported in `pages/transactions/transactions.page.ts` but the import is never referenced elsewhere in that file (no `ModalController.create` call, no template tag). It is declared/exported by `shared.module.ts` but no `<app-add-transaction>` usage was found anywhere in the app — looks like dead/orphaned code.
