## Purpose
Account/profile settings hub: tabbed page for editing personal details, spouse details, children, businesses, category customization, and (feature-flagged) open-banking account permissions/consent management.

## Key entities/files
- `settings.page.ts` — `SettingsPage` (standalone component, no module.ts — routed directly via `loadComponent` in `app-routing.module.ts`). Owns per-tab reactive forms (`personalFormGroup`, `spouseFormGroup`, `childrenFormArray`, `businessesFormArray`, `addBusinessFormGroup`, `addPermissionFormGroup`) and tab visibility driven by `AccessService.getFeatureState`.
- `settings.page.html` / `.scss` — tabbed layout (personal / businesses / categories / permissions).
- `my-categories-tab/my-categories-tab.component.ts(+html/scss)` — child component for the "הקטגוריות שלי" tab; manages user category/subcategory rules (`UserCategoryGroup`, `UserRuleRow`) — custom recognition %, VAT %, tax %, equipment flag, comment-pattern rules per category/subcategory.

## Main flows
- Personal / spouse details: forms patched from `AuthService.getUserDataFromLocalStorage()` + refreshed via `AuthService.restoreUserData()`; `updatePersonalDetails`/`updateSpouseDetails` PATCH via `AuthService.updateUser`.
- Children: `loadChildren`/`updateChildrenDetails`/`confirmDeleteChild` via `AuthService.getChildren/updateChildren/deleteChild`, backed by a dynamic `childrenFormArray`.
- Businesses: `loadBusinesses`/`saveBusiness`/`openAddBusinessModal`+`submitAddBusiness`/`deleteBusiness` all delegate to `GenericService` (`loadBusinessesFromServer`, `createBusiness`, `updateBusiness`, `deleteBusiness`, backed by a dynamic `businessesFormArray` synced to the `Business[]` signal.
- Categories tab: delegated entirely to `MyCategoriesTabComponent`.
- Permissions tab ("ניהול הרשאות וחשבונות", access-gated by `AppFeature.OPEN_BANKING_PERMISSIONS_TAB"): `fetchMyPermissions`/`grantViewPermission` via `MyPermissionsService` (view-permission grants to other users), and account-source management — `fetchAccountSources`/`onPullSource` via `TransactionsService.getSourcesWithTypes` and `SyncStatusService.retrySource` (per-source manual transaction pull retry), rendered through `GenericTableComponent`.
- Date handling helpers (`stringToDate`/`toDisplayDate`/`toApiDate`/`dateToApiString`) convert between dd-mm-yyyy display strings, `Date` objects (form controls), and yyyy-mm-dd API strings.

## Related topics
- Backend: auth (user/spouse/children CRUD), business (business CRUD), transactions (account sources, retry-source), delegation (view-permission grants via MyPermissionsService).
- Frontend shared: category-management is a related but separate topic — `my-categories-tab` here is settings-local category *rule* editing, not the same component as shared `category-management`.
- Frontend pages: transactions (via `TransactionsService` for account sources).
