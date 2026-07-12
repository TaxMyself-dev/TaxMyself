## Purpose
Ionic modal form for editing a supplier's default categorization (category, sub-category, tax %, VAT %, depreciation %, equipment flag).

## Key entities/files
- `add-supplier.component.ts` — class `addSupplierComponent`, selector `app-add-supplier`. `@Input() supplier` (setter normalizes `isEquipment` to a `"0"/"1"` string and initializes the form); `@Input() editMode`. Cascading category → sub-category selects via `ExpenseDataService.getcategry()` / `.getSubCategory()`, cached per-category in `subCategoriesListDataMap`. Save calls `ExpenseDataService.editSupplier()` (an `addSupplier` path exists commented out — only edit is currently wired).
- `add-supplier.component.html` / `.scss` — form markup.
- `add-supplier.component.spec.ts` — default Angular test scaffold.

## Main flows
- Open pre-filled with a supplier (`@Input supplier`, `editMode: true`).
- Change category → reloads sub-category list; picking a sub-category autofills tax/VAT/depreciation percents.
- Save is disabled until the form is valid and dirty (`isEqual` diff against the initial form snapshot).
- Save → `ExpenseDataService.editSupplier(data, id)` → dismiss modal.

## Related topics
- Backend: expenses (`ExpenseDataService` supplier/category endpoints)
- Frontend shared: select-client and select-supplier both open this component via `ModalController.create({ component: addSupplierComponent, componentProps: { supplier, editMode: true } })` for their "edit" row action.
