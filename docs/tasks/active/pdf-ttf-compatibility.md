# PDF TrueType compatibility

- Status: `INTEGRATED_LOCAL_MAIN`
- Worktree: isolated feature checkout
- Branch: `codex/pdf-ttf-compatibility`
- Base commit: `82446400227ee6e5ed8751eafc2eab1656c4161c`

## Acceptance criteria

- Use the already tested converted Simpler Regular/Bold TTF files in local and standalone PDF rendering, including footers.
- Preserve document layout, numbering, accounting and signing semantics.
- Focused backend PDF tests, Nest build, PDF-service tests/build and browser layout checks pass.
- Generate original/copy and multipage synthetic documents using actual renderers and FillFaster signer; inspect final page counts, embedded fonts, signature envelope and all rendered pages.
- Deliver signed fixtures for manual Mi Reader verification.

## Boundaries

No database, storage, email, production, credential, signing contract or frontend changes. No local main integration or remote push without the user's separate approvals. Live signing is authorized for synthetic fixtures only. Previously issued documents are unchanged.

## Verification

Executed against this feature implementation, before the documentation-only completion update:

- Backend: `npm test -- --runInBand documents/pdf`: exit 0, 7 suites / 153 tests passed, 145.087 seconds.
- Backend: `npm run build`: exit 0. Built assets contain both TTF files and no OTF files.
- PDF service: `npm run build`: exit 0.
- PDF service: `npm test`: exit 0, 20 tests passed, 0 skipped.
- PDF service: `node -e "const {verifyLayout}=require('./scripts/check-layout.cjs');verifyLayout({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',fontDirectory:require('path').resolve('../backend/src/assets/document-fonts'),template:require('./dist/document-pdf.template.js')}).then(()=>console.log('Browser numeric layout PASS')).catch(()=>{console.error('Browser layout failed');process.exitCode=1})"`: layout passed for all three large/negative amount fixtures.
- Backend: `node -r ts-node/register scripts/verify-document-pdf-compatibility.ts <artifacts> --sign`: exit 0, four synthetic fixtures rendered through actual local and standalone renderers; four provider requests completed through the actual FillFasterSigner. No DB, email, storage, HTTP app startup or document issuance side effects.
- Independent pypdf/Poppler/OpenSSL/Pillow validation of all 12 PDFs: single-page original/copy and seven-page original/copy. Every page has embedded Type0/CIDFontType2 fonts, no Type3; extracted text and rendered page pixels match across local, standalone and signed results. All 16 signed pages visually reviewed.
- OpenSSL `cms -verify -binary -inform DER ... -noverify`: all four signatures verified mathematically over the original ByteRange bytes; certificate trust/revocation was not evaluated. First validation invocation had an empty OpenSSL process failure; the same unchanged artifacts passed on rerun. No extra signing calls were made.
- `git diff --check`: passed. No remaining OTF references in PDF consumers. Frontend OTF assets are unchanged.

## Environment and limits

- Windows / Node v24.13.0 / npm 11.6.2 / installed Google Chrome. Dependencies installed independently with `npm ci --no-audit --no-fund` in each package. PDF-service install warned that its declared runtime is Node 22; Node 22/Linux container tests were not run. Package versions and engines were not changed.
- No full repository test suite or frontend build: frontend, accounting and database code are unchanged. Focused PDF tests and both applicable builds passed.
- The user previously verified both TTF variants in Mi Reader. These new application-template signed fixtures still require manual Mi Reader verification; desktop checks do not prove every mobile reader works.
- No known baseline test failures encountered. No main integration, push or deployment performed.

## Reproduction

From backend, run `node -r ts-node/register scripts/verify-document-pdf-compatibility.ts <new-output-directory>` for local/standalone unsigned fixtures. Add `--sign` only when four live FillFaster requests are intended; this reads the existing backend `.env` token without logging it. Signed paths cannot already exist. Output defaults to the ignored root `.test-tmp/pdf-ttf` folder. No full application bootstrap is needed.

## Local main follow-up

The user confirmed the fixes work in test and explicitly approved local main integration. Fonts were integrated as `724d3b2f`; combined verification and the mandatory local port check are recorded in `docs/tasks/active/pdf-local-main-integration.md`. The earlier no-main-integration statements above refer to the original feature-stage verification. No push or production deployment was authorized for this integration.
