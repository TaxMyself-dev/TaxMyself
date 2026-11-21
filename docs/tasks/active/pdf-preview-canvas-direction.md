# PDF preview canvas direction

- Status: `INTEGRATED_LOCAL_MAIN`
- Branch: `codex/pdf-ttf-compatibility` (continuation of PDF compatibility work)
- Base: `cba5efb51bcd8c1e802866d99965980c9a5a1c20`
- Test integration target: `cccde9291207311f7df9050fb8ca5eebeff8ffaa`

## Acceptance

- PDF canvases are explicitly LTR; surrounding Hebrew dialog remains RTL.
- Existing component tests render successfully and assert computed directions.
- Real PDF.js mobile rendering preserves Hebrew, Latin, dates and decimal amounts.
- Frontend DEV build passes; integrate, push and deploy only test with explicit user authorization.

## Boundaries

Frontend canvas direction only. No font, PDF generation, signing, database,
backend, main integration or production changes. User explicitly approved
integration, push and deployment to test for this correction.

## Evidence

The user validated the test deployment, then explicitly approved local main integration only. The canvas fix was integrated as `c21a5eac`. Combined main verification is recorded in `docs/tasks/active/pdf-local-main-integration.md`; no main push or production deployment was authorized.
