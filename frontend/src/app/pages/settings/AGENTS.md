## Purpose
Account/profile settings hub: tabbed page for editing personal details, spouse details, children, businesses, category customization, permissions, and connected-account management.

## Key entities/files
- `settings.page.ts` — `SettingsPage` (standalone component, no module.ts — routed directly via `loadComponent` in `app-routing.module.ts`). Owns per-tab reactive forms (`personalFormGroup`, `spouseFormGroup`, `childrenFormArray`, `businessesFormArray`, `addBusinessFormGroup`, `addPermissionFormGroup`). Categories and permission management are available to every authenticated user; only the open-banking account-source subsection is entitlement-gated.
- `settings-access.policy.ts` — testable settings-tab policy and the narrow predicate that prevents users without `OPEN_BANKING` from loading bank account sources.
- `settings.page.html` / `.scss` — tabbed layout (personal / businesses / categories / permissions / subscription).
- `my-categories-tab/my-categories-tab.component.ts(+html/scss)` — child component for the "הקטגוריות שלי" tab; manages user category/subcategory rules (`UserCategoryGroup`, `UserRuleRow`) — custom recognition %, VAT %, tax %, equipment flag, comment-pattern rules per category/subcategory.

## Main flows
- My Subscription offers owner-only cancellation with explicit confirmation
  of paid access through period end and retained debts. The server provides
  pendingCancellation with effective date/eventId; the card shows no future
  charge and offers withdrawal before expiry. Pending cancellation disables
  plan changes. Confirmation sends the displayed status and currentPeriodEnd,
  withdrawal sends the exact eventId, and both refresh billing state. Expired
  or non-paid subscriptions cancel immediately. Delegation/impersonation and
  complimentary access cannot mutate. A canceled downgrade is not restored
  when cancellation is withdrawn. KT-052 uses the standard module gate for
  open banking; Feezback account deletion is a separate task.
- Personal / spouse details: forms patched from `AuthService.getUserDataFromLocalStorage()` + refreshed via `AuthService.restoreUserData()`; `updatePersonalDetails`/`updateSpouseDetails` PATCH via `AuthService.updateUser`.
- Children: `loadChildren`/`updateChildrenDetails`/`confirmDeleteChild` via `AuthService.getChildren/updateChildren/deleteChild`, backed by a dynamic `childrenFormArray`.
- Businesses: `loadBusinesses`/`saveBusiness`/`openAddBusinessModal`+`submitAddBusiness`/`deleteBusiness` all delegate to `GenericService` (`loadBusinessesFromServer`, `createBusiness`, `updateBusiness`, `deleteBusiness`, backed by a dynamic `businessesFormArray` synced to the `Business[]` signal.
- Categories tab: visible to every authenticated user and delegated entirely to `MyCategoriesTabComponent`.
- Permissions tab ("ניהול הרשאות וחשבונות", visible to every authenticated user): `fetchMyPermissions`/`grantViewPermission` via `MyPermissionsService` (view-permission grants to other users). Its account-source subsection remains conditional on `ModuleName.OPEN_BANKING`; eligible users get `fetchAccountSources`/`onPullSource` via `TransactionsService.getSourcesWithTypes` and `SyncStatusService.retrySource` (per-source manual transaction pull retry), rendered through `GenericTableComponent`.
- Subscription tab: a `COMPLIMENTARY_FULL` subscription is shown as "גישה מלאה ללא חיוב", with no plan, monthly charge, next billing date, or payment-method replacement controls.
- Subscription status card offers "החלפת תוכנית" for ACTIVE owners without
  billing overrides. It navigates to /billing/plans using the existing plan
  checkout; it does not submit a charge. Other lifecycle states and delegated,
  admin or complimentary overrides do not show this action.
- My Subscription also displays a pending downgrade's target and effective
  date. Owner cancellation sends its exact eventId through BillingStateService
  and refreshes billing state; stale requests are rejected by the backend.
  The plans page now previews prorated upgrades or next-renewal downgrades
  before confirmation (KT-051).
- Date handling helpers (`stringToDate`/`toDisplayDate`/`toApiDate`/`dateToApiString`) convert between dd-mm-yyyy display strings, `Date` objects (form controls), and yyyy-mm-dd API strings.

## Related topics
- Backend: auth (user/spouse/children CRUD), business (business CRUD), transactions (account sources, retry-source), delegation (view-permission grants via MyPermissionsService).
- Frontend shared: category-management is a related but separate topic — `my-categories-tab` here is settings-local category *rule* editing, not the same component as shared `category-management`.
- Frontend pages: transactions (via `TransactionsService` for account sources).
