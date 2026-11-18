# Subscription settings design trial

- Status: implementation complete; verification recorded below; awaiting Elazar's review.
- Worktree: `C:\Users\user\Keepintax\TaxMyself-settings-personal-redesign`
- Branch: `codex/settings-personal-redesign`
- Starting feature commit: `c26490ae`; continue the existing isolated feature worktree.
- Design: Figma file `E6ehoDZ8fwDpKd1eSbbGB6`, settings section `3099:63943`.
- References: subscription `3112:73565`, card `3112:73121`, permissions `3112:75187`,
  banking `3112:74796`, payment history `3112:74207`.

## Acceptance criteria

- Two collapsible sidebar groups. Personal contains only account and businesses.
- Subscription contains details, payment method, payment history, permissions and banking.
- One continuous content scroller; clicking any of the seven links scrolls to its
  section; manual scrolling updates the active link, including the short last section.
- New layout follows the existing Figma typography, neutral borders, pill actions,
  purple payment card and account-connection cards, with responsive narrow layouts.
- Real account data and existing provider/lifecycle methods, not Figma sample amounts.
- Keep old settings and shared billing, payment, Gmail and banking implementations unchanged.
- No backend, schema, entitlement, payment-provider or OAuth-contract changes.
- No main integration, remote push, live charge, cancellation or consent mutation in verification.

## Implementation

`SettingsNewSubscriptionComponent` inherits the existing subscription view models
and handlers. Its template retains status, discounts, pending downgrade/cancellation,
explicit cancellation confirmation, plan changes, hosted card replacement, payer
profile editing and authenticated receipt actions. Complimentary access gets a
stable payment-section anchor without a card or replacement control. Replacement
also checks owner override before opening the existing dialog. Card brand/last four/
expiry and pre-VAT monthly amount use backend fields; no tax or total is invented.

`SettingsNewPage` adds a separate collapsible subscription group, section markers,
generic scroll tracking and jump navigation. It renders existing Gmail and inbound
email components in a scoped shell. User-permission add/revoke and SHAAM status/
OAuth reuse inherited handlers. The new grant form validates email and blocks
duplicate submissions. Existing OAuth return URLs are preserved (they can return
to legacy settings); this UI task does not change provider registrations.

Connection data initializes only when permissions/banking is reached. Source reads
retain the existing OPEN_BANKING entitlement gate. Banking cards reuse the existing
row model and action predicates keyed by sourceRecordId; the management component
and its server-verified previews remain unchanged. Owners can still revoke saved
permissions after losing the source-list entitlement. Opening the management
component reads saved metadata; provider refresh occurs only through existing
explicit refresh/confirmation flows.

Jump navigation detects the newly rendered lazy children before measuring their
target position. ResizeObserver updates scroll tracking after asynchronous content
changes. Mobile sidebar links scroll inside their own row rather than overflowing
the viewport. The payment-history table uses auto height inside the page scroller.

The prior personal/family edit cycles and user's existing local heading/port edits
are preserved. Category-rule redesign is still outside this task.

## Verification

Commands run from `frontend/`:

```powershell
npm run build -- --configuration production --progress=false
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/*.spec.ts --include=src/app/pages/settings/my-subscription-tab/*.spec.ts --include=src/app/pages/settings/settings-access.policy.spec.ts --include=src/app/pages/settings/settings-source-deletion.spec.ts --include=src/app/pages/settings/settings-shaam-connection.spec.ts --include=src/app/pages/settings/settings-banking-row-actions.spec.ts --ts-config=.test-tmp/tsconfig.subscription-tests.json --progress=false
```

The temporary focused tsconfig extends `tsconfig.spec.json`, limits compilation to
those specs/declarations, includes `src/test.ts`/`src/polyfills.ts`, and uses
`types: [jasmine, node]` and `skipLibCheck: true`. The legacy full-spec compilation
issues documented in the personal-settings task are unchanged; no full-suite pass
is claimed. Existing budget/CommonJS and shared disabled-control warnings remain;
no thresholds or global settings were changed.

An isolated standalone bootstrap renders the actual new components with Aura,
synthetic billing/permission/banking data and stubbed services. Browser checks cover
desktop 1440x1000, mobile 390x844, all links, manual return to account, sidebar
collapse, permission dialog, empty/complimentary payment state and horizontal
overflow. Screenshots were inspected; fixed narrow inherited button widths and
payment-card layout. Static Figma assets are local; authenticated business images
remain dynamic. No account sign-in or live provider write was performed by tests.

Final results, local commit and manual-review notes follow after verification.

## Manual review

Run the user's own frontend on 4201 and backend on 3001. Choose `הגדרות חדש`,
then expand `הגדרות מנוי`. Review all five sections and navigation in both widths.
Use test-account data for any actual payer/permission change. Payment replacement,
plan changes, cancellation and provider connection/disconnection still require
their existing explicit user actions and confirmations. Do not initiate live
financial actions merely to validate the layout.

No production/schema/accounting/external-contract impact. Existing billing and
connection read calls are reused; no new API endpoints or weaker access policy.

## Final verification (2026-11-15)

- Focused Karma command above: 55/55 passed on the final TypeScript/templates;
  subsequent changes only corrected mobile card sizing and history container height.
- Final `npm run build -- --configuration production --progress=false`: exit 0;
  main bundle `03ebd2dcc035c466`. Budget/CommonJS warnings remain, including
  settings-new stylesheet 6.30 kB against a 6 kB warning budget. No limits changed.
- Final isolated browser check: desktop 1440x1000 and mobile 390x844, correct active
  links, manual account return, group collapse, permission dialog, complimentary
  payment anchor without card; no horizontal overflow or JavaScript errors.
  Screenshots of corrected mobile card and history height reviewed.
- `git diff --check` passed. Diff against HEAD for old settings, shared select,
  banking manager, payment dialog and billing-state service is empty.
- Live provider/account mutations and the full legacy suite were not run.
- User's local port/environment changes and family heading remain outside this commit.
- Local feature delivery only; main and remote remain untouched.

## Logout confirmation (2026-11-15)

New settings sidebar logout now opens a dedicated keyed PrimeNG confirmation with
Hebrew confirm/cancel actions and default focus on cancel. Only acceptance calls
the existing AuthService.logout; dismiss/cancel keeps the session. Old settings
and AuthService remain unchanged.

Verification: `node frontend/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p frontend/tsconfig.app.json --noEmit` passed.
Focused command from frontend: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/settings-navigation.spec.ts --ts-config=.test-tmp/tsconfig.subscription-tests.json --progress=false`: 5/5 passed.
`git diff --cached --check` passed. No full-suite or live logout test performed.

## Categories and personal Cancel (2026-11-18)

Continued from local feature commit 94ba7cc4. Added Cancel beside Save/Clear only
in personal details: restores a structured-cloned entry snapshot, including dates,
resets touched/dirty state and closes editing; pending saves block cancellation.
Image saves remain explicit and separate, as in the existing account image UI.

Added My Categories after payment history under subscription (personal remains
account/businesses only). It participates in the continuous scroller and loads on
first arrival. SettingsNewCategoriesComponent inherits the existing category/rule
handlers and local confirmation/toast providers. Separate template/styles match
history's neutral bordered panel, auto-height generic tables and mobile cards.
Business selection, rule/subcategory edit, deletion confirmations and direct-card
cashflow preference retain existing APIs and access behavior. The new select
adapter uses app-input-select with search for all four category selectors. Old
settings and shared components are unchanged; no backend/ENV/schema changes.

Verification on final implementation:
- `node frontend/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p frontend/tsconfig.app.json --noEmit`: passed.
- From frontend: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/*.spec.ts --include=src/app/pages/settings/my-categories-tab/*.spec.ts --ts-config=.test-tmp/tsconfig.subscription-tests.json --progress=false`: 31/31 passed. Shared reactive disabled warning remains. Full legacy suite not run.
- `npm run build -- --configuration production --progress=false`: completed;
  build hash 4f8a89c3d56f4e41, main d772fef566228705. Existing budget/CommonJS warnings remain; thresholds unchanged.
- Synthetic isolated preview: desktop 1440x1000/mobile 390x844, both tables,
  searchable business selector, category active link, subcategory edit dialog,
  personal cancel restoring saved name, no document/content horizontal overflow
  or runtime exceptions. Screenshots reviewed. No live mutation executed.
- `git diff --check` passed; diff of old settings/shared select against HEAD empty.
- User's local start port, API environment and spouse heading remain outside commit.
- No main integration or remote push.

## Family Cancel (2026-11-18)

Added Cancel to spouse and each child's edit actions in new settings only.
Entry snapshots restore cleared/modified values and calendar dates, reset touched
and dirty state, and close editing. Canceling a newly added relative discards its
local draft without a server delete. Switching child editors first cancels the
previous draft so the whole-family save cannot include an abandoned edit.
Pending spouse/children saves block cancellation. Existing save APIs unchanged.

Validation on final implementation:
- `node frontend/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p frontend/tsconfig.app.json --noEmit`: passed.
- From frontend: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/settings-new.page.spec.ts --ts-config=.test-tmp/tsconfig.subscription-tests.json --progress=false`: 16/16 passed.
- `git diff --check`: passed; old settings diff empty. No full suite, production
  rebuild or live account mutations performed for this focused change.

## Clear child names (2026-11-18)

Child names are nonNullable controls whose reset default is the saved name.
New settings Clear now explicitly resets childFName/childLName to empty strings
and childDate to null. It remains in edit mode, guards pending saves and leaves
siblings untouched. Cancel still restores the entry snapshot. Old settings and
shared form builders unchanged.

Focused command from frontend: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/settings-new.page.spec.ts --ts-config=.test-tmp/tsconfig.subscription-tests.json --progress=false`: 17/17 passed, including actual nonNullable names, sibling preservation and Cancel restoration.
`git diff --check` passed. No broad build/full suite rerun for this focused fix.
