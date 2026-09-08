## Purpose

Creates and edits supplier defaults used by expense entry and classification.

## Key entities/files

- `add-supplier.component.ts` owns supplier identity, category, recognition,
  equipment and percentage controls.
- `add-supplier.service.ts` calls supplier endpoints.

## Main flows

- Subcategory changes hydrate defaults; equipment changes switch between tax
  and depreciation-reduction semantics.
- Supplier identity is business-scoped. Do not replace it with user-only
  lookup/deduplication.

## Related topics

- `backend/src/expenses/AGENTS.md`
- `frontend/src/app/components/mannual-expense/AGENTS.md`
