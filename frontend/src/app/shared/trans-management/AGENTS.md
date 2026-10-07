## Purpose
Admin-panel tab with operational tooling for Feezback open-banking consent/diagnostics and a dev-only sync-scenario simulator.

## Key entities/files
- `trans-management.component.ts` — selector `app-trans-management`. Uses `FeezbackService` (`createConsentLink`, `getUserAccounts`) and `SyncStatusService` (dev-only `simulateScenario`/`resetSim`). `showSimPanel` is gated by `environment.enableDevTools`.
- `trans-management.component.html` — Feezback consent dialog, accounts fetch button, legacy file-upload control, and (non-prod) simulator buttons.

## Main flows
- Connect to open banking: show a consent-confirmation dialog, then create a consent link and redirect (`window.location.assign`).
- Fetch the current admin's own accounts as a diagnostic check.
- Dev-only: simulate a sync scenario (`success`/`allFailed`/`partialSync`/`partialConsent`) then navigate to `/my-account` with query params to observe it; reset the simulation.

## Related topics
- Backend: feezback (open-banking consent/accounts), transactions (sync simulator and legacy file upload)
- Frontend pages: admin-panel (embeds `<app-trans-management>`), my-account (navigation target of the dev simulator)
