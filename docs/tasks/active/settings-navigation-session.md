# Temporary settings section memory

Status: verified by Elazar; approved for local main integration, without push.
Date: 2026-11-18
Branch: codex/settings-personal-redesign
Base: 8f9e5bd6 (previous authorized main integration).

## Acceptance and implementation

Keep the last settings section during one running app instance. Returning from
another route restores that section, not a pixel offset or edit/form draft.
A reload/reopen starts at account. No DB or browser-storage persistence.

SettingsNavigationSessionService is a root in-memory singleton. Firebase owner
changes/sign-out and represented-client changes reset it while settings is absent.
Same-owner profile refresh does not reset it. Visit contexts include a generation
so stale scroll events cannot repopulate memory after a context round trip.
AuthService and ClientPanelService behavior/endpoints remain unchanged.

SettingsNewPage restores instantly after its view exists and uses ResizeObserver
to keep the anchor stable through async business/billing/connection loading.
Intermediate restoration scroll events do not overwrite the remembered section.
User wheel, touch, pointer, keyboard or sidebar navigation releases the anchor.
Edit signals remain new-page defaults; the service stores no forms or edit flags.
Only new settings changes; old settings and main remain unchanged.

## Verification

- From frontend: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/*.spec.ts --ts-config=.test-tmp/tsconfig.settings-integration-tests.json --progress=false`: exit 0, 37/37 passed on final implementation. Covers visits, logout/same-user login, account switch, represented-client round trips, stale events, new app instance, no browser writes, instant restore and unchanged edit flags.
- `npm run build -- --configuration production --progress=false`: exit 0; hash d0646298e86cc1b3. Existing budget/CommonJS warnings remain; no thresholds changed.
- `git diff --check`: passed. No full-suite/live account/provider mutation checks.
- The initial diagnostic test run passed before the instant-scroll adjustment;
  production was stopped and final tests/build above rerun on consolidated code.
- No backend, schema, accounting, external API or entitlement changes. Identity
  is used only to discard temporary UI memory. Ports 4203/3003 remain uncommitted.

Manual check: visit categories/payment; leave and reopen settings; verify same
section with read-only fields. Sign out/in, switch user or represented client,
or reload the tab: account is the default. Verify wheel/keyboard scrolling after
restoration and sidebar jumps still update the highlighted section.

Elazar confirmed this works and explicitly approved local main integration on 2026-11-18. Remote push remains forbidden.


## Local integration approval

Main remains at the original tested base 8f9e5bd6; feature executable revision is
ca67f911. There are no incoming main commits, executable conflicts or changes
since the recorded 37/37 tests and successful production build. Reused that
unchanged verification evidence, plus Elazar's manual feature confirmation.
Only this approval record changed afterward. Fast-forward local main to this
feature; leave worktree ports uncommitted and the unrelated untracked main
.codex-remote-attachments folder untouched. No push or deployment.
