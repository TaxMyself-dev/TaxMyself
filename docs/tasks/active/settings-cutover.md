# Canonical settings screen cutover

- Status: WORKER_COMPLETE
- Branch: codex/settings-cutover
- Base: 2542b564 (verified local main; new isolated worktree)

## Acceptance and scope

- Only the redesigned settings screen loads at /settings for every user role.
- /settings-new redirects to /settings, preserving query parameters/fragments.
- Admin and customer settings buttons navigate directly without an old/new menu.
- Installed-PWA refresh remains available separately for both roles.
- Delete the legacy settings page/template/styles. Preserve the shared form,
  banking, business, account and OAuth logic required by the redesigned screen
  in a viewless SettingsFormBase, and retain shared domain child components.
- Preserve auth/billing guards, admin-only agent section, deferred connection
  activation, hidden dedicated forwarding-email selection and all saved data.
- Existing tab=permissions OAuth callbacks open the corresponding new section.
- No main integration or push without renewed user approval for this feature.

## Plan and verification

Inspect routes, navigation and inherited forms first; extract the form base,
remove the legacy view, switch canonical routing, then test the direct consumers
and run the frontend production build. No backend/schema/provider change.

Focused frontend command:

```powershell
$specs = (Get-Content tsconfig.settings-cutover.spec.json -Raw | ConvertFrom-Json).include | Where-Object { $_ -like '*.spec.ts' }
$ngArgs = @('node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--browsers=ChromeHeadless', '--ts-config=tsconfig.settings-cutover.spec.json')
foreach ($spec in $specs) { $ngArgs += "--include=$spec" }
node @ngArgs
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

## Evidence

- Nine selected spec files: 65 tests passed, exit 0, Chrome Headless 157.
- The first test invocation omitted Karma include flags, so it selected unrelated
  specs outside the narrow tsconfig and failed compilation. No tests passed in
  that invocation; the corrected selector above ran exactly the intended specs.
- Production build: passed, exit 0, on the final executable source. Initial bundle 3.15 MB exceeds the 2 MB warning threshold; existing style-budget/CommonJS warnings and the intentionally retained hidden inbound-email import warning remain. No build errors.
- Reviewed the extracted base against the source page: only the class/decorator
  and presentation-only imports changed; form/service logic is retained.
- Source checks find no imports of the deleted SettingsPage or settings.page
  template/style files, and no navigation to /settings-new except its redirect.
- git diff --check: passed. Documentation checker validated 93 local Markdown links; structural checks confirmed deletion of the old view, a viewless form base, and forwarding-email selection still hidden.
- No backend tests required for this frontend-only cutover. No live database,
  provider, login session or OAuth calls. Prior feature tests are not presented
  as evidence for these changes.
- No schema, accounting, authorization-policy or external API changes. Auth and
  billing guard registration is unchanged and covered by routing tests.
- Local environment files were copied from main; backend/.env is Git-ignored.
- No main integration, GitHub push or deployment performed.
