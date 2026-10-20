# Feezback spouse and payment source deletion integration

- Status: VERIFIED
- Task manager: Codex, direct user-authorized main delivery
- Branch: codex/integration
- Worktree: TaxMyself-feezback-integration
- Verified GitHub/main base: d59ee789
- Sources: codex/feezback-spouse at 25864c52; codex/feezback-delete-payment-source at 2275965d.

## Acceptance criteria

- [x] Fetch GitHub and fast-forward clean local main before integrating.
- [x] Merge spouse feature before its dependent source-deletion branch.
- [x] Preserve newer main changes; no merge conflicts occurred.
- [x] Restore desktop/mobile local API URLs to port 3000 before delivery.
- [x] Complete combined backend/frontend checks. Normal push/ref verification recorded below.

## Review

Both source tips are preserved through merge commits 6338eba1 and 8cb5f780.
Reviewed ownership/authorization, permanent-source FK routing, source deletion
transaction/locks, retained history, profile protection of verified flags,
checkbox defaults, provider redirect handling and appended schema SQL. Newer
main account-image, phone validation, generic table action and document-draft
changes remain present. Updated stale topic documentation that still described
account-number suffix routing. Extended the isolated frontend test configuration
to cover consent-return navigation and source deletion together.

Dependencies installed independently with npm ci in both integration packages.
Copied primary backend/.env without printing credentials and verified Git ignore.
No app boot, provider request, database access or schema execution during integration.
The prior approved source/FK/user schema SQL must be applied manually before any
production deployment; DEV was already migrated during feature work.

## Combined verification

Backend: 14 focused suites / 105 tests passed; Nest build passed. Tests cover
consent/JWT/identity state, direct cards, admin date pulls, sync state, provider
transaction deduplication, pending archive, source association/deletion and admin
sync controller. Mocked provider failures intentionally emit log errors.

Frontend: 33 isolated ChromeHeadless tests passed across consent entry, return navigation and payment-source deletion. Production Angular build passed (exit 0). Existing CSS/bundle and CommonJS warnings
and host Node 24 versus declared frontend Node 20 are tracked as environment
warnings; no dependency versions or lockfiles were changed.

## Limits

Source delivery only: no production deployment or production data access.
No new tax, VAT, expense recognition or journal behavior; cache bill links and
historical transactions remain. No new provider contract or billing change.
The previously investigated deleted-card display and sync-status drift are not
additional fixes in this requested merge. Feature worktree backups, keys and
running local servers are preserved.

## Exact integration checks

Backend (backend/):
```text
npm test -- --runInBand --silent --runTestsByPath src/feezback/feezback-spouse.spec.ts src/feezback/feezback-jwt.spouse.spec.ts src/feezback/feezback-connection-state.spec.ts src/feezback/feezback.controller.spec.ts src/feezback/feezback.service.direct-card.spec.ts src/feezback/feezback.service.admin-date-range.spec.ts src/transactions/user-sync-state.service.spec.ts src/feezback/consent/open-banking-connection.spec.ts src/feezback/consent/feezback-consent-api.service.spec.ts src/transactions/utils/provider-transaction-dedup.util.spec.ts src/transactions/pending-transaction-archive.spec.ts src/transactions/transactions.controller.admin-sync.spec.ts src/transactions/source-record-association.spec.ts src/transactions/delete-payment-source.spec.ts
npm run build
```
Frontend (frontend/):
```text
npm run ng -- test --watch=false --browsers=ChromeHeadless --include=src/app/pages/billing/open-banking/open-banking.page.spec.ts --include=src/app/pages/billing/open-banking/open-banking-return.spec.ts --include=src/app/pages/settings/settings-source-deletion.spec.ts --ts-config=tsconfig.feezback-spouse.spec.json --karma-config=karma.feezback-spouse.conf.js
npm run build -- --configuration production
```
All exited 0. Frontend build: main.c29e18d07dafbe92.js, runtime.eb49d910e1c748d4.js.
Git diff/show checks passed. Desktop/mobile local API values are both 3000;
production API configuration was not changed. Refreshed origin again after tests:
main and origin/main remained equal at d59ee789 before delivery.
