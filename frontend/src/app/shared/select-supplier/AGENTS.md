## Purpose
Modal listing existing suppliers for selection when entering an expense, with inline delete/edit actions.

## Key entities/files
- `popover-select-supplier.component.ts` — class `selectSupplierComponent`, selector `app-select-supplier`. Loads suppliers via `ExpenseDataService.getAllSuppliers()`; delete via `.deleteSupplier()`; edit opens `addSupplierComponent` as a modal.
- `select-supplier.component.html` — `app-table` with checkbox selection + delete/edit row actions, "select" button.
- `select-supplier.component.spec.ts` — default Angular test scaffold.

## Main flows
- Load and display the supplier list; filter by name.
- Select a supplier (dismisses the modal with the chosen row, role `'success'`).
- Delete a supplier (confirm via `GenericService.openPopupConfirm`).
- Edit a supplier (opens `add-supplier` modal in edit mode).

## Related topics
- Backend: expenses (`ExpenseDataService` supplier endpoints)
- Frontend shared: `modal-add-expenses` opens this component (`ModalController.create({ component: selectSupplierComponent })`) when the user picks a supplier while adding an expense; add-supplier (opened for the edit-supplier flow)
