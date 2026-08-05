## Purpose
Ionic modal form for creating a new "bill" (a named payment-source label tied to a business) or attaching an existing bill as an extra source for a given payment method.

## Key entities/files
- `add-bill.component.ts` — `@Input() paymentMethod`; radio choice between "existing bill" vs "new bill"; multi-business support (picks business from `AuthService` user data); calls `TransactionsService.addSource()` / `.addBill()`.
- `add-bill.component.html` / `.scss` — form markup.
- `add-bill.component.spec.ts` — default Angular test scaffold.

## Main flows
- Select an existing bill to attach as a source for the current payment method.
- Add a brand-new bill (name + business number for MULTI_BUSINESS users).
- Dismiss the modal (`ModalController.dismiss`) with `'cancel'` or `'success'` role.

## Related topics
- Frontend: transactions (`TransactionsService.addSource`/`addBill`), auth (`AuthService` user/business data)

## Note
This component appears currently unused/orphaned: it is declared and exported by `shared.module.ts`, but no `<app-add-bill>` tag or `ModalController.create({ component: AddBillComponent })` call referencing this class was found anywhere in the app. The app's actual "add bill" modal is `components/add-bill` (selector `app-add-bill2`), used from `my-account.page.ts` and `pages/transactions/transactions.module.ts`.
