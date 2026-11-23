# Hide dedicated forwarding-email selection

- Status: WORKER_COMPLETE
- Branch: codex/gmail-business-routing
- Base: 739169c1

## Result and acceptance

The dedicated forwarding-email address selection is temporarily hidden in both
/settings and /settings-new. The original template entries are retained inside
HTML comments, including their wrappers, so the component is not instantiated
and no empty section remains. Component code, imports, services, backend routes,
existing addresses and inbound processing are preserved. Gmail OAuth remains
visible. Restore the two commented template entries to reactivate selection.

## Verification

- Reviewed the complete template diff (four added comment lines).
- Static checks passed for both templates: no active app-inbound-email entry,
  original entry retained in source, app-gmail-integration still active.
- Command: node tmp/check-hidden-forwarding-email.cjs (temporary local checker,
  outside the repository; strips HTML comments before checking active entries).
- Frontend command: node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
- Production build result: passed (exit 0). Bundle/style budget and CommonJS warnings remain; retained unused component imports may be reported because reactivation code is intentionally preserved. No build errors.
- git diff --check: passed.
- Focused component tests: no dedicated forwarding-email parent/template test
  exists; unrelated settings/Gmail suites were not rerun for this reversible
  template-only change. No tests were added merely to duplicate the implementation.
- No backend, database, schema, provider, accounting or production changes.
- No local main integration or remote push.
