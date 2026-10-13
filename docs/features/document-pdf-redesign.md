# Document PDF redesign and identity images

Approved reference: `receipt-logo-left-spacious.png`, produced in the document redesign chat on 2026-10-13. Logo left; issuer right; original/date in recipient band; title and tables spaced lower. No accounting or numbering behavior changed.

## Components and configuration

Local HTML/CSS -> Chromium PDF -> FillFaster digital signature -> existing Firebase original/copy storage lifecycle. Existing document transforms remain the source of monetary values. The new renderer covers receipt, tax invoice, tax invoice-receipt, transaction invoice, credit invoice, quote and work order, with draft watermark, repeat table headings, optional notes/allocation, payment details and footer pagination.

Install backend dependencies with npm. Docker installs Chromium. Outside Docker set `PDF_CHROMIUM_EXECUTABLE_PATH`; Chrome/Edge standard Windows paths are also recognized. Fonts are bundled in `backend/src/assets/document-fonts` and copied by Nest to `dist/assets`. No font/image/network fetches are allowed from HTML.

Copy the variable names from `backend/.env.document-pdf.example` into the deployment's existing secret/configuration management, not source control. The existing provider token must now be supplied as `FILLFASTER_API_TOKEN`; no credential has been rotated or changed externally.

- `DOCUMENT_PDF_PREVIEW_RENDERER=local`: local unsigned draft previews.
- `DOCUMENT_PDF_RENDERER=legacy`: preserve existing signed issuance while provider template is prepared.
- `DOCUMENT_PDF_RENDERER=local` + `DOCUMENT_PDF_LOCAL_SIGNING_VALIDATED=true`: use local rendering for issuance only after signing/visual gates below pass.
- `FILLFASTER_BASE_PDF_FID`: dedicated clean provider template. Reusing an existing invoice template overlays its old headers/tables, even with empty prefill data.
- `PDF_CHROMIUM_NO_SANDBOX=false`: default. Only set true explicitly on hosts unable to run Chromium sandbox; rendering still disables JavaScript and blocks external/file requests.

## Persistent image ownership

Business logo: `POST/GET/DELETE /business/:id/logo`. Personal image: `POST/GET/DELETE /auth/profile-image`. POST accepts one multipart `file`; mutations return `{imagePath}` and authenticated GET returns PNG bytes. Settings and avatars use authenticated Blob reads and release object URLs.

Input is capped at 5 MB/16 megapixels. Sharp fully decodes single-frame PNG/JPEG/WebP and reencodes PNG without metadata, retaining alpha. Logos fit within 1600px; profiles within 512px. SVG, PDFs, animation and corrupt raster data are rejected. Storage path is immutable and validated; no arbitrary URL/bucket path is accepted. Logo ownership and delegation mirror existing business-profile edits; profile mutations mirror existing agent restriction. Generic profile/business writes cannot set asset paths.

`Business.logoPath`, `User.profileImagePath` and `Documents.issuerPdfSnapshot` require prepared SQL before deployment. The individual files under `backend/scripts/migrations/2026-10-13_*` contain reviewable one-time statements; guarded equivalents are appended to `docs/redesign/cutover.sql`. No database or production schema was modified during implementation.

Old logo blobs are retained because issued document snapshots can reference them. Replacing/removing a business logo affects future documents. Existing PDFs are served from existing stored paths. Old documents without snapshots never adopt a future logo during regeneration. Profile blobs and orphaned uploads also remain; periodic storage cleanup is a separate task.

## Signing experiment (2026-10-13)

At the user's explicit instruction, the existing credential was used in-memory with development template `95gqltPdeC` and synthetic preview data. No real document/customer issuance or database write occurred. Prepared PDF returned with complete ByteRange/Contents signature envelope. Independent CMS digest/RSA signature verification passed; certificate indicated FillFaster, validity 2023-02-28 to 2033-02-25. Certificate trust-chain and revocation status were not assessed.

Visual check FAILED template isolation: provider stamped its badge and old receipt text/tables over the supplied PDF. Nine account templates were inspected; none was a clean signing template. Therefore local signed issuance remains disabled. A clean template/support-assisted sign-only route must be checked for unchanged content, page count, minimal/no overlays and valid signature before setting the validation flag. A successful HTTP response or signature envelope alone does not satisfy the rollout gate.

## Verification and rollout

1. Apply reviewed schema only to an authorized development database; do not bootstrap against production or an unguarded production copy.
2. Set existing token through environment configuration and local preview renderer, leave legacy issuance.
3. Verify uploads/replace/remove on real authorized development Firebase storage; test ownership/delegation and profile context changes.
4. Create a clean provider template and run one-page and multi-page synthetic signing probes, then inspect rendered pages and independently verify CMS signature/certificate policy. Do not change an existing production template.
5. Enable local issuance in development; exercise original/copy and pending allocation finalization, signing failure rollback and stored snapshot logo replacement.
6. Release only after acceptance; production deployment is separate.

Standalone sample command: from `backend`, `node -r ts-node/register scripts/render-document-samples.ts <output-directory>`. It does not call a provider or database. Visual QA covers logo/no-logo, mixed Hebrew/English and a 55-row four-page invoice.

Implementation verification: 35 focused backend PDF/image tests, 30 existing document/business regression tests, 12 focused frontend Chrome tests (including real raster crop/transparent logo preservation), Nest build and Angular production build passed. One legacy UsersService DI smoke test fails unchanged on the recorded base `df7fd270` because its test module omits SharedService; it is not a new regression. Angular build retains existing bundle/style-budget and CommonJS warnings. No broad-suite green claim is made.

Targeted frontend command: `ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.account-images.spec.json --include=src/app/services/account-images.service.spec.ts --include=src/app/components/account-image/account-image.component.spec.ts`. This intentionally isolates feature tests from unrelated legacy specs while production build checks the full application. Windows Codex sandbox verification used an uncommitted native-realpath fallback and workspace temp directories; ordinary host execution should not require that tooling.
