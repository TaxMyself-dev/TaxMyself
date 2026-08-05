## Purpose
Modal listing existing clients (recipients used in document creation/invoicing) with select/delete/edit actions.

## Key entities/files
- `select-client.component.ts` — selector `app-select-client`; loads clients via `DocCreateService.getClients(businessNumber)` (business number is currently hardcoded: `"314719279"`); delete via `DocCreateService.deleteClient()`; edit opens `addSupplierComponent` as a modal (clients and suppliers share the same edit form/model, `ICreateSupplier`).
- `select-client.component.html` — `app-table` with checkbox selection + delete/edit row actions, "select" button.

## Main flows
- Load and display the client list; filter by name.
- Select a client (dismisses the modal with the chosen row, role `'success'`).
- Delete a client (confirm via `GenericService.openPopupConfirm`).
- Edit a client (opens `add-supplier` modal in edit mode, reusing the supplier edit form).

## Related topics
- Backend: clients (`DocCreateService.getClients`/`deleteClient`)
- Frontend pages: doc-create (opens this component via `ModalController.create({ component: SelectClientComponent })`)
- Frontend shared: add-supplier (opened for the edit-client flow)
