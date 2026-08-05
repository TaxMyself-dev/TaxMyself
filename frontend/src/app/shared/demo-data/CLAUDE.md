## Purpose
Admin-panel tab for managing demo user profiles used for QA/sales demos: create ("seed"), delete ("reset"), and impersonate them.

## Key entities/files
- `demo-data.component.ts` — standalone component; lists `DemoProfileListItem[]` via `AdminPanelService.listDemoProfiles()`; seed/reset via `AdminPanelService.seedDemoProfile()`/`.resetDemoProfile()`; impersonation via `ClientPanelService.setSelectedClient()` + `AuthService.loadViewAsUserData()`.
- `demo-data.component.html` — profile cards/list with seed/reset/enter-as-user buttons.

## Main flows
- Seed a demo profile: creates the demo user + pre-populated data, shows the generated email/password in a toast.
- Reset a demo profile: deletes the demo user and all associated rows (native `window.confirm`, irreversible).
- Direct-card scenario (only for profiles whose backend list item has `supportsDirectCardScenario`): "צור מצב ישן עם כפילויות" / "הפעל תיקון כרטיס דיירקט" — flip the demo user between the pre- and post-Direct-card-fix states via `AdminPanelService.seedDemoLegacyDuplicates()`/`.applyDemoDirectCardFix()`. Both rebuild the demo user's transaction cache (and wipe its classifications), so each asks for a native `window.confirm` first. Neither is gated on `profile.exists` — the backend seeds the user when missing.
- Enter as the demo profile's primary user, or as one of its delegated `DemoSubUser` clients — sets a `sessionStorage` flag (`tm.demoSimulateBankLoader`) so `/my-account` shows the "pulling from bank" loader, then navigates there.

## Related topics
- Backend: demo-data (seed/reset endpoints via `AdminPanelService`)
- Frontend pages: admin-panel (embeds `<app-demo-data>`), my-account (navigation target after entering as a demo user)
- Frontend shared: clients-dashboard (shares the enter-as-user impersonation pattern)
