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

Only `Business.logoPath` and `User.profileImagePath` require schema additions. The one-time statements are in `backend/scripts/migrations/2026-10-13_identity-images.sql`; guarded equivalents are appended to `docs/redesign/cutover.sql`. On 2026-10-14 the user explicitly authorized execution; both nullable VARCHAR(255) columns were added and verified on `keepintax-dev`. No production schema was modified. Run only these feature statements, not the entire cutover file.

The user clarified that branding must be current when the PDF is generated. The initially proposed issuer snapshot was removed from the Entity, preparation logic, schema and tests. PDF generation now reads current business name/address/phone/email/logo; pending-allocation documents use the latest logo, including a logo replaced or removed since the record was saved. Already-generated PDFs are served from their stored files and do not change. Explicit company identity for system billing receipts is preserved. Old image blobs and orphaned uploads remain; periodic storage cleanup is separate.

## Signing experiment (2026-10-13)

At the user's explicit instruction, the existing credential was used in-memory with development template `95gqltPdeC` and synthetic preview data. No real document/customer issuance or database write occurred. Prepared PDF returned with complete ByteRange/Contents signature envelope. Independent CMS digest/RSA signature verification passed; certificate indicated FillFaster, validity 2023-02-28 to 2033-02-25. Certificate trust-chain and revocation status were not assessed.

Initial visual check FAILED template isolation: provider stamped its badge and old receipt text/tables over the supplied PDF. Nine account templates were inspected; none was a clean signing template. At that stage local signed issuance remained disabled. A successful HTTP response or signature envelope alone does not satisfy the rollout gate.

The user subsequently created template `3IfhJjgmAp` with one optional empty text field named `placeholder` (the editor refuses zero-field templates). Both one-page receipt and four-page invoice probes succeeded with `prefill_data: {}`. Independent CMS content-digest/RSA signature verification passed for both. Page counts stayed 1/4; all four invoice pages were rasterized at 900px and compared pixel-for-pixel with their unsigned inputs, with no differences. One-page receipt was also visually inspected with no overlays. The placeholder and provider badge did not appear. The signing/template gate is satisfied; the example environment now records this fid and enables local signing for development after the reviewed schema is applied. Runtime defaults and existing production configuration were not changed.

## Verification and rollout

1. Apply reviewed schema only to an authorized development database; do not bootstrap against production or an unguarded production copy.
2. Set existing token through environment configuration and local preview renderer, leave legacy issuance.
3. Verify uploads/replace/remove on real authorized development Firebase storage; test ownership/delegation and profile context changes.
4. Completed: clean template `3IfhJjgmAp` passed one-page/multi-page signing and visual probes. Keep the placeholder optional and empty; do not add visible labels/tables to this template. Certificate trust/revocation policy remains a deployment review item.
5. Enable local issuance in development; exercise original/copy and pending allocation finalization, signing failure rollback and current logo replacement/removal before PDF generation.
6. Release only after acceptance; production deployment is separate.

Standalone sample command: from `backend`, `node -r ts-node/register scripts/render-document-samples.ts <output-directory>`. It does not call a provider or database. Visual QA covers logo/no-logo, mixed Hebrew/English and a 55-row four-page invoice.

Implementation verification: 35 focused backend PDF/image tests, 30 existing document/business regression tests, 12 focused frontend Chrome tests (including real raster crop/transparent logo preservation), Nest build and Angular production build passed. One legacy UsersService DI smoke test fails unchanged on the recorded base `df7fd270` because its test module omits SharedService; it is not a new regression. Angular build retains existing bundle/style-budget and CommonJS warnings. No broad-suite green claim is made.

Targeted frontend command: `ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.account-images.spec.json --include=src/app/services/account-images.service.spec.ts --include=src/app/components/account-image/account-image.component.spec.ts`. This intentionally isolates feature tests from unrelated legacy specs while production build checks the full application. Windows Codex sandbox verification used an uncommitted native-realpath fallback and workspace temp directories; ordinary host execution should not require that tooling.
