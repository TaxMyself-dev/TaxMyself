# Personal settings design trial

- Status: implemented, awaiting Elazar's visual review; no main integration.
- Worktree: `C:\Users\user\Keepintax\TaxMyself-settings-personal-redesign`
- Branch: `codex/settings-personal-redesign`
- Base: `91d5bf274bb8cf8b33e445e0c017e0c7f1ae3ef3` (verified origin/main).
- Source: Figma `E6ehoDZ8fwDpKd1eSbbGB6`, section `3099:63943`.

## Acceptance and scope

- Add `הגדרות חדש` to the existing settings menu and protected `/settings-new` route.
- Preserve all existing settings code and its route.
- Implement only personal settings: account, family and businesses.
- Use a collapsible personal group with indented account/business links.
- Clicking a link scrolls within the page; manual scrolling updates the active link.
- Reuse existing forms, persistence, images, delete confirmations and permissions.
- Apply Figma's Simpler typography, 256px side navigation, 980px account card,
  8px card radii, neutral colors, pill controls and two-column business cards.
- Adapt to narrow screens without horizontal overflow.
- No merge to main, remote push, deployment, backend/schema or entitlement change.

## Implementation

Separate standalone component/template/styles inherit the existing settings form
and service behavior. The old settings files have zero diff. New field rendering
preserves typed select values, Date controls and validators. Failed business saves
retain the editor; cancellation restores the prior values. Draft children are
removed locally; persisted children/businesses keep existing confirmation flows.

Subscription, payment methods/history, permissions, banking and category-rule
redesign remain deferred. No new spouse-deletion API is introduced. Business logo
upload remains available after creation, using the existing authenticated upload.
The new business form exposes fields supported by the current creation handler.

## Setup and environment

The primary checkout's Git index is corrupt; it was not repaired or changed.
Initial checkout used cached origin/main, then the new clean branch alone was
fast-forwarded to verified current origin/main. Local main was not integrated.
Copied ignored `backend/.env` from the primary checkout without printing content.
No other root-level environment files were present in the inspected module roots.

`npm ci --no-audit --no-fund` and the legacy-peer-deps variant fail on the existing
lockfile's missing `encoding` entry. Installed independently with:

```powershell
npm install --package-lock=false --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund pdfjs-dist@4.7.76
```

The second command restores the PDF version recorded in the lockfile after the
first command resolved a newer incompatible version. Neither manifest changed.
Host Node is v24.13.0; repository requests ^20.11.1. No engine config was changed.

## Verification

Final results and commit are recorded below after checks finish.

Commands from `frontend/`:

```powershell
npm run build -- --configuration production --progress=false
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings-new/settings-new.page.spec.ts --include=src/app/pages/settings/settings-access.policy.spec.ts --ts-config=.test-tmp/tsconfig.focused.json --progress=false
```

Temporary focused tsconfig extends `tsconfig.spec.json`, limits includes to those
two specs and declarations, includes `src/test.ts`/`src/polyfills.ts`, and sets
`types: [jasmine, node]`, `skipLibCheck: true`. This isolates known existing global
spec compilation errors; it does not disable application/template checking.
The standard test command's include flag alone still compiles unrelated specs,
which fail on obsolete Angular `async` imports, renamed component exports and
Node typings. No claim of a passing full suite is made.

Visual verification renders the actual new page in a temporary standalone
bootstrap with synthetic data, stubbed services and no server writes. A separate
Chrome headless profile checks desktop 1440x1000 and mobile 390x844, screenshots,
scroll navigation, manual scroll, collapse and business editing. This is isolated
component evidence, not authenticated end-to-end persistence validation.

Production builds retain existing size/CommonJS warnings. No thresholds changed.

## Manual review

Open the feature frontend, sign in normally, and choose `הגדרות חדש` from the
settings menu. Review account spacing, family expansion, business cards/editing,
creation, image selection and narrow layout. Manually verify persistence using
test-account data. Existing settings remain available through `הגדרות`.

No production, schema, accounting, security-policy or external-contract changes.

## Final evidence (2026-11-15)

- Production build: PASS, hash `8d7c6c193a85b688`, 37.416 seconds.
- Focused ChromeHeadless tests: PASS, 7/7 (5 new, 2 existing settings-policy).
- Browser fixture: no runtime exceptions; 256px sidebar, 980px account card;
  navigation updates active section, manual return selects account, collapse
  hides links, business edit opens. Desktop and mobile have no horizontal overflow.
- Mobile business editing and creation: no horizontal overflow; creation form opens.
- Family fixture: spouse and child forms open; blank new child is invalid.
- Existing `pages/settings/`, package.json and package-lock.json are byte-identical
  to base (verified `git diff --exit-code 91d5bf27 -- ...`).
- `git diff --check`: PASS. Environment and preview scratch are ignored.
- The initial raw test/build diagnostics were on an in-progress revision and also
  exposed a new select-option typing mismatch, corrected before these final passes.
- No authenticated server writes, actual image uploads or live persistence tests
  were performed. Full legacy spec suite is not claimed as passing.

Feature frontend launch (dev API, separate port):

```powershell
node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4318 --build-target app:build:dev
```

Open `http://127.0.0.1:4318/settings-new` and sign in normally. This server uses
`environment.dev.ts`, not production. No local backend was started.
