## Purpose
Admin-panel tab for managing demo user profiles used for QA/sales demos: create ("seed"), delete ("reset"), and impersonate them.

## Key entities/files
- `demo-data.component.ts` — standalone component; lists `DemoProfileListItem[]` via `AdminPanelService.listDemoProfiles()`; seed/reset via `AdminPanelService.seedDemoProfile()`/`.resetDemoProfile()`; impersonation via `ClientPanelService.setSelectedClient()` + `AuthService.loadViewAsUserData()`.
- `demo-data.component.html` — profile cards/list with seed/reset/enter-as-user buttons.

## Main flows
- Seed a demo profile: creates the demo user + pre-populated data, shows the generated email/password in a toast.
- The registry-driven designer sandbox appears without special admin UI code; its card provides the synthetic login credentials and the existing create action seeds its bank/card fixture.
- Reset a demo profile: deletes the demo user and all associated rows (native `window.confirm`, irreversible).
- Direct-card scenario (only for profiles whose backend list item has `supportsDirectCardScenario`): "צור מצב ישן עם כפילויות" / "הפעל תיקון כרטיס דיירקט" — flip the demo user between the pre- and post-Direct-card-fix states via `AdminPanelService.seedDemoLegacyDuplicates()`/`.applyDemoDirectCardFix()`. Both rebuild the demo user's transaction cache (and wipe its classifications), so each asks for a native `window.confirm` first. Neither is gated on `profile.exists` — the backend seeds the user when missing.
- Enter as the demo profile's primary user, or as one of its delegated `DemoSubUser` clients — sets a `sessionStorage` flag (`tm.demoSimulateBankLoader`) so `/my-account` shows the "pulling from bank" loader, then navigates there.

## Related topics
- Backend: demo-data (seed/reset endpoints via `AdminPanelService`)
- Frontend pages: admin-panel (embeds `<app-demo-data>`), my-account (navigation target after entering as a demo user)
- Frontend shared: clients-dashboard (shares the enter-as-user impersonation pattern)


## Direct-card cashflow update (2026-11-04)

This section supersedes earlier bank-only / skipped_direct descriptions. Direct
cards now import through the ordinary card feed and retain readiness/consent/error
checks. New outcomes are success/failed, with legacy skipped outcomes retried.
The owner's persisted opt-in preference excludes only owned bank-source rows
classified to the immutable SYSTEM subcategory identified by
DIRECT_CARD_BANK_PAYMENT; no per-row visibility flag or name matching. One SQL
predicate serves cashflow lists/charts, pending archives/previews and approval
guards. Existing approved expenses/journals are preserved. Settings stores the
preference on the server; the cashflow list can explicitly show excluded rows.
Apply docs/features/direct-card-cashflow.sql manually before booting this version.
The script is also appended to cutover.sql and has not been executed here.
See docs/features/direct-card-cashflow.md for schema, demo, testing and limits.
