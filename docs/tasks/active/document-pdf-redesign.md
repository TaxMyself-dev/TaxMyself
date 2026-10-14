# Document PDF redesign and identity images

- Status: `READY_FOR_DEV_INTEGRATION`
- Task manager: current document redesign chat
- Branch: `codex/document-pdf-redesign`
- Base commit: `df7fd270f793e2cf77bf262c6def4cc1c1719907`

## Business outcome

Locally rendered Hebrew documents match the approved spacious receipt mockup (logo left, issuer right, date/original in recipient band, centered title). FillFaster signs the completed PDF. Users can upload, replace, preview and remove business logos and personal profile images.

## Acceptance criteria

- [x] Local PDF preview and mandatory local-render/sign issuance retain existing accounting and document lifecycle behavior (focused tests and verified clean-template probes).
- [x] All supported document types, copy/original, optional subtitle/note/allocation, multi-page tables and Hebrew render correctly.
- [x] Owner-scoped validated image upload endpoints and persistent image references; existing delegation rules preserved (mocked DB/storage tests).
- [x] Settings image upload UI and profile avatars use shared image control.
- [x] Focused tests, backend/frontend builds and rendered sample QA.
- [x] Live signing success is independently verified before enabling local issuance; no production database/service access.

## Scope and constraints

User explicitly approved implementation plan including image persistence/schema and new existing-provider request shape. On 2026-10-14 the user clarified current branding at PDF generation, rejected the issuer snapshot, and explicitly authorized applying the two image-column statements to the development database. Do not change accounting, auth guards, AI-chat branches, production credentials or external templates. Do not merge/push main in this task; user requested an isolated branch. Use only the new renderer; user explicitly requested removing the old route and rollout switches.

Workers: `codex/document-image-backend` (backend assets/business/user; own schema SQL) and `codex/document-image-frontend` (frontend settings/avatar; no backend changes). Manager owns documents renderer/signing integration and combined review. Each worker has its own isolated worktree at recorded base; no shared dependencies or governance edits.

## Handoff

Integrated worker commits on `codex/document-pdf-redesign`: `505dfe1b`, `17121530`, `8d044dde`, `03c8d907`. Main/AI-chat refs untouched by implementation. No push or deployment.

- Backend: focused PDF/image suites 35/35 passed (33 initial plus two reviewed credit-VAT/issuer-ownership regressions), existing document/business regression suites 30/30 passed. Nest build passed.
- Frontend: production Angular build passed (existing style/bundle budget and CommonJS warnings). Targeted browser suite 12/12 passed, including real PNG profile crop and transparent logo preservation. Original frontend lockfile retained.
- One legacy `users.service.spec.ts` fails to supply SharedService; reproduced unchanged on a separate clean worktree at `df7fd270`, not caused by this feature.
- Local dependency verification required an uncommitted Windows sandbox native-realpath fallback; frontend lock's existing versionless encoding entry was repaired temporarily for installation then restored. No dependency directories/tooling/credentials are committed.
- Visual fixtures: logo/no-logo one-page receipts and 55-row/four-page invoice rendered and inspected, including repeated table headers and final totals.
- Real provider development probe: CMS content digest/RSA signature passed independent verification; issuer certificate validity recorded. Trust chain/revocation not assessed. Visual acceptance failed because old template overlays remain; nine existing account templates contain no clean signature-only template.
- Originally prepared only: schema SQL and guarded cutover appendix. On 2026-10-14 the snapshot proposal was removed and only `business.logoPath` / `user.profileImagePath` were added to verified `keepintax-dev` at the user's request, each VARCHAR(255), nullable, default NULL. No snapshot column existed or was added. No production service, provider template or credential changed.
- Provider gate resolved: user supplied `3IfhJjgmAp` with optional empty `placeholder`. One-/four-page signatures passed independent CMS verification; page counts unchanged, all four invoice raster pages identical to inputs. One-page receipt visually unchanged. Subsequent user approval made this verified fid a code constant and local rendering/signing the only issuance route.
- Pending: live authenticated storage/browser integration checks and environment configuration. No main merge or deployment. Database image-column application completed on 2026-10-14; current-branding/unchanged stored-PDF regression tests added.

## 2026-10-14 current-branding correction

- Removed issuer snapshot Entity/property/migration and its cutover statement. Only business/user image references are persisted.
- Current business identity and logo are loaded at PDF generation; explicit system billing identity is preserved. Existing stored PDFs are not regenerated merely because branding changed.
- Verified `keepintax-dev` from configured local development connection, added the two missing columns, then re-read information_schema: both VARCHAR(255), nullable YES, default NULL. No issuer snapshot column existed; documents schema was unchanged. No Nest bootstrap, seeds, other cutover statements or production connection.
- Verification: four affected backend suites passed 29 tests; after adding the stored-PDF regression, the final PDF-routing suite passed 16/16. Nest build exit 0. No frontend code changed.

## 2026-10-14 new renderer only

User requested fixed signing template `3IfhJjgmAp` in code and removal of rendering/validation/browser configuration switches. Only the API token remains external. Removed legacy provider layout generation; previews always render locally and issuance always renders then signs. Chromium is auto-detected. No DB or frontend changes.

Verification: four PDF Jest suites passed 28/28; Nest build passed. Standalone Chrome auto-detection produced logo/no-logo receipts and a multi-page invoice without PDF configuration variables (local browser connection required sandbox escalation). No schema, accounting, frontend or provider-contract changes. API token remains secret configuration.

Local worktree run configuration: backend ignored .env uses PORT=3001; frontend local and mobile environments target port 3001. Hosted development/production endpoints unchanged.
Verification: port settings and development serve configuration checked; git diff --check passed. Angular development build did not complete in the local sandbox (no progress after bundle setup); no successful build claimed for this configuration-only change.

## Startup dependency injection correction

Removed duplicate DocumentsService provider from AppModule; the imported DocumentsModule owns and exports the service with its renderer/signer dependencies. This fixes the reported AppModule resolution failure without duplicating PDF providers. No database or accounting changes.
Verification: Nest build and 17 PDF-routing tests passed. Module registrations reviewed: DocumentsModule owns DocumentsService and exports it; AppModule imports it without recreating the provider. Full application restart remains to be verified by the running development session.
