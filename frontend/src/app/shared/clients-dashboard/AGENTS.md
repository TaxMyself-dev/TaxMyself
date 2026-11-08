## Purpose
Admin-panel tab listing all end users/clients with subscription and open-banking status, plus admin operational actions (impersonation, data pulls, cache/sync management).

## Key entities/files
- `clients-dashboard.component.ts` — table of users (columns + `ITableRowAction`s) built from `AdminPanelService.getAllUsers()` joined with `AdminBillingService.getSubscriptions()`; per-row actions each open a dialog or trigger a service call: enter-as-user, Feezback data pull dialog (`FeezbackService`), live accounts/cards diagnostic dialog, refresh open-banking sources, clear transaction cache, Google Drive OCR month-sync dialog (`AdminPanelService`).
- `clients-dashboard.component.html` — search bar, stats, `app-generic-table`, several `p-dialog`s for the above actions.

## Main flows
- The "ניהול הרשאות וניתוק מבנקאות פתוחה" row action opens the shared
  `OpenBankingManagementComponent` with an explicit client Firebase ID. The
  server authorizes the real admin actor; the UI previews consent-wide effects,
  separates single-consent cancellation from full primary/spouse disconnection,
  retains partial/unknown outcomes, and refreshes the client list after mutations.
  The action does not delete stored sources or classifications, change billing,
  or initiate a new consent on behalf of a client.

- Operational buttons use unified generic-table `actions` with explicit
  desktop icon presentation and no file requirement. The same actions are
  automatically available in mobile table-row menus; cache clearing retains
  its loading indicator and cannot execute while busy.
- List & search users; view subscription status and open-banking connection state. The open-banking table column uses the shared boolean status icons instead of text.
- Enter-as-user: `ClientPanelService.setSelectedClient()` + `AuthService.loadViewAsUserData()` then navigate to `/my-account` (same mechanism used for accountant delegation).
- Pull a client's transactions from Feezback for a specific bank account/card source.
- View a client's live accounts/cards from Feezback (diagnostic dialog).
- Clear a client's transaction cache; refresh their open-banking sources.
- Sync a client's Google Drive folder for a given month/business number and list extracted documents.

## View-as cache recovery

Before enabling the impersonation header, enter-as-user calls the admin-only
conditional sync hook for the target. A missing/`empty` cache starts a
login-style sync and My Account waits for its state transition; a completed
cache is left untouched. Navigation still waits for
`AuthService.loadViewAsUserData()` before opening `/my-account`.

## Related topics
- Backend: billing (subscription status via `AdminBillingService`), feezback (accounts/cards/pull/refresh), google-drive (Drive OCR sync), users
- Frontend pages: admin-panel (embeds `<app-clients-dashboard>`), my-account (navigation target of enter-as-user)
- Frontend shared: admin-billing (shares `AdminBillingService`), demo-data (shares the enter-as-user pattern)
