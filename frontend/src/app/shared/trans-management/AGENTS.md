## Purpose
Admin-panel tab with operational tooling for transaction sourcing: manual Finsite pulls, open-banking (Feezback) consent/diagnostics, and a dev-only sync-scenario simulator.

## Key entities/files
- `trans-management.component.ts` — selector `app-trans-management`. Uses `AdminPanelService` (Finsite pulls: `getTransFromApi`, `getAllUsersDataFromFinsite`), `FeezbackService` (`createConsentLink`, `getUserAccounts`), `SyncStatusService` (dev-only `simulateScenario`/`resetSim`). `showSimPanel` gated by `!environment.production`.
- `trans-management.component.html` — form for Finsite date-range fetch, consent dialog, accounts fetch button, and (non-prod) simulator buttons.

## Main flows
- Fetch transactions from the Finsite API for a given `finsiteId`/date range.
- Bulk-fetch all users' data from Finsite.
- Connect to open banking: show a consent-confirmation dialog, then create a consent link and redirect (`window.location.assign`).
- Fetch the current admin's own accounts as a diagnostic check.
- Dev-only: simulate a sync scenario (`success`/`allFailed`/`partialSync`/`partialConsent`) then navigate to `/my-account` with query params to observe it; reset the simulation.

## Related topics
- Backend: finsite (Finsite pull endpoints), feezback (open-banking consent/accounts)
- Frontend pages: admin-panel (embeds `<app-trans-management>`), my-account (navigation target of the dev simulator)
