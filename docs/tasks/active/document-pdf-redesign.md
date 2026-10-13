# Document PDF redesign and identity images

- Status: `IMPLEMENTED_AWAITING_PROVIDER_TEMPLATE`
- Task manager: current document redesign chat
- Branch: `codex/document-pdf-redesign`
- Base commit: `df7fd270f793e2cf77bf262c6def4cc1c1719907`

## Business outcome

Locally rendered Hebrew documents match the approved spacious receipt mockup (logo left, issuer right, date/original in recipient band, centered title). FillFaster signs the completed PDF. Users can upload, replace, preview and remove business logos and personal profile images.

## Acceptance criteria

- [x] Local PDF preview and configurable local-render/sign issuance retain existing accounting and document lifecycle behavior (tests; live clean-template gate pending).
- [x] All supported document types, copy/original, optional subtitle/note/allocation, multi-page tables and Hebrew render correctly.
- [x] Owner-scoped validated image upload endpoints and persistent image references; existing delegation rules preserved (mocked DB/storage tests).
- [x] Settings image upload UI and profile avatars use shared image control.
- [x] Focused tests, backend/frontend builds and rendered sample QA.
- [ ] Live signing success is independently verified before enabling local issuance; no production access.

## Scope and constraints

User explicitly approved implementation plan including image persistence/schema and new existing-provider request shape. Prepare schema SQL only; do not execute against any database. Do not change accounting, auth guards, AI-chat branches, production credentials or external templates. Do not merge/push main in this task; user requested an isolated branch. Keep legacy renderer selectable until signing validation is complete.

Workers: `codex/document-image-backend` (backend assets/business/user; own schema SQL) and `codex/document-image-frontend` (frontend settings/avatar; no backend changes). Manager owns documents renderer/signing integration and combined review. Each worker has its own isolated worktree at recorded base; no shared dependencies or governance edits.

## Handoff

Integrated worker commits on `codex/document-pdf-redesign`: `505dfe1b`, `17121530`, `8d044dde`, `03c8d907`. Main/AI-chat refs untouched by implementation. No push or deployment.

- Backend: focused PDF/image suites 35/35 passed (33 initial plus two reviewed credit-VAT/issuer-ownership regressions), existing document/business regression suites 30/30 passed. Nest build passed.
- Frontend: production Angular build passed (existing style/bundle budget and CommonJS warnings). Targeted browser suite 12/12 passed, including real PNG profile crop and transparent logo preservation. Original frontend lockfile retained.
- One legacy `users.service.spec.ts` fails to supply SharedService; reproduced unchanged on a separate clean worktree at `df7fd270`, not caused by this feature.
- Local dependency verification required an uncommitted Windows sandbox native-realpath fallback; frontend lock's existing versionless encoding entry was repaired temporarily for installation then restored. No dependency directories/tooling/credentials are committed.
- Visual fixtures: logo/no-logo one-page receipts and 55-row/four-page invoice rendered and inspected, including repeated table headers and final totals.
- Real provider development probe: CMS content digest/RSA signature passed independent verification; issuer certificate validity recorded. Trust chain/revocation not assessed. Visual acceptance failed because old template overlays remain; nine existing account templates contain no clean signature-only template.
- Prepared only: image/snapshot SQL and guarded cutover appendix. No database, production service, provider template or credential changed.
- Pending: user creates/provides clean FillFaster template from supplied blank PDF; repeat one-/multi-page signing and visual acceptance before enabling local issuance. Dev storage/database/browser integration remains a manual release check.
