## Purpose
Account/profile settings hub: tabbed page for editing personal details, spouse details, children, businesses, category customization, permissions, and connected-account management.

## Key entities/files
- `settings.page.ts` — `SettingsPage` (standalone component, no module.ts — routed directly via `loadComponent` in `app-routing.module.ts`). Owns per-tab reactive forms (`personalFormGroup`, `spouseFormGroup`, `childrenFormArray`, `businessesFormArray`, `addBusinessFormGroup`, `addPermissionFormGroup`). Categories and permission management are available to every authenticated user; only the open-banking account-source subsection is entitlement-gated.
- `settings-access.policy.ts` — testable settings-tab policy and the narrow predicate that prevents users without `OPEN_BANKING` from loading bank account sources.
- `settings.page.html` / `.scss` — tabbed layout (personal / businesses / categories / permissions / subscription).
- `my-categories-tab/my-categories-tab.component.ts(+html/scss)` — child component for the "הקטגוריות שלי" tab; manages user category/subcategory rules (`UserCategoryGroup`, `UserRuleRow`) — custom recognition %, VAT %, tax %, equipment flag, comment-pattern rules per category/subcategory.

## Main flows

- Account sources, subscription history, classification rules and category
  tables use unified generic-table `actions`. Mobile menus inherit their
  existing showWhen predicates and show loading state; no mobile override is
  required. Direct-card pull restrictions and category/subcategory distinctions
  remain in their page predicates.
- KT-053: My Subscription shows PREPARE/READY trial banking enrollment and
  links to continuation or withdrawal into a non-banking plan. Withdrawal
  preserves the trial and card, without scheduling an automatic lower-plan
  charge. Paid plan changes still use KT-051.
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
- The permissions tab also shows the SHAAM invoice-allocation connection status
  for every numbered business. Initial connect and explicit reconnect both use
  the hardened server-side OAuth flow; reconnect deliberately bypasses the
  status pre-flight so the callback replaces the stored grant and scopes.
  A refresh `invalid_scope` marks the saved connection as requiring a new
  authorization; settings shows that state explicitly and its reconnect button
  starts `/oauth/authorize` directly without deleting the old grant first.
  Settings initiation records only the bounded callback origin `settings`, so
  successful authorization returns to the permissions tab and never offers a
  document-issuance action.
  The expected `SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED` response is presented as
  a disabled sandbox limitation, not as an unknown connection failure.
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

## Account images
- Personal settings and existing business cards use the standalone `AccountImageComponent` for select, preview, save, replace, cancel and remove. Uploads are explicit and separate from detail-form saves. View-as client mode disables personal-profile mutations. Business logo editing follows existing business-save behavior, including delegated editing; server permissions remain authoritative.
- `AccountImagesService` uses authenticated HttpClient GET/POST/DELETE for `/auth/profile-image` and `/business/:id/logo`, with multipart `file`, Blob reads and `{ imagePath }` mutations. No public storage URL or Firebase Auth photoURL is used.
- PNG/JPEG/WebP up to 5MB are checked before upload. Decoded images above 16 million pixels are rejected; profile uploads are center-cropped to a square (up to 1024px), logos preserve original proportions/transparency. Backend validation remains required.
- Blob URLs are revoked on replacement/destroy; context changes cancel stale loads. Profile and business logo paths update the existing tab-scoped caches after success.

## Open-banking payment source deletion
The permissions tab also hosts `OpenBankingManagementComponent` outside the
OPEN_BANKING entitlement gate, so an owner can revoke consent after losing module
access. It previews server-reported consents and every associated source, supports
single-consent revocation separately from full primary/spouse disconnection,
and never deletes sources, classifications, associations or approved expenses.
Incomplete provider discovery and partial termination remain explicit retry states.
Represented-client mode cannot use owner controls. Reconnect uses the existing
`/billing/open-banking` enrollment and identity-selection flow. Changes refresh
auth state and (when entitled) the account-source list.
Expired/blocked subscriptions also have an auth-only `/billing/open-banking/manage`
page, linked directly from the global billing-block dialog. Existing Settings
billing guards remain unchanged. The billing-route dialog exemption keeps consent
management usable without unlocking other protected pages.

Each source has a delete action identified by sourceRecordId (including spouse sources with matching numbers). Active consent shows a popup explaining that Feezback requires a new consent with the desired accounts/cards. Disconnected sources require confirmation and DELETE /transactions/sources/:sourceRecordId; success removes the row, while a server consent conflict refreshes the list and shows the explanation. Historical transactions are retained.

Payment-source dialogs use the payment-source confirmation key and a dedicated centered host capped at 28rem (viewport minus 2rem on narrow screens). The consent explanation includes the source number and uses neutral wording without naming the provider.
