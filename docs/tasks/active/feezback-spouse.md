# Feezback spouse identity

- Status: WORKER_COMPLETE
- Worktree: TaxMyself-feezback-spouse
- Branch: codex/feezback-spouse
- Base commit: 10f626c20c94daf2ae97964da1b06ba70ace78a6

## Approved acceptance criteria
- Offer an unchecked spouse checkbox immediately before provider redirect if hasOpenBanking OR hasSpouseFeezbackIdentity.
- Preserve the existing primary SUB; use Firebase UID + _sub_spouse only after explicit selection. Reuse on every attempt.
- Persist the permanent user flag only after a spouse data-ready webhook and valid consent linked to a provider source. Retain it after expiry.
- Synchronize both confirmed identities under the existing user and route individual-source retries correctly.
- Keep main untouched; do not contact production, change billing terms, or create live consents during validation.

## Impact
- Schema: one boolean column on user, default false. Deployment requires the supplied cutover SQL first.
- Provider: same APIs and signed JWT contract, one additional deterministic identity only when explicitly selected.
- Source identifiers: clean account labels; connectionRole lives only on source, sync/cache reference its primary key. Opaque external transaction IDs stay unchanged for idempotency.
- Security: profile writes cannot set the permanent verified flag; enrollment authorization is preserved.
- Production: no operations performed.

## Verification and handoff (2026-10-15)

Result: complete in feature branch; not integrated, pushed or deployed.

Backend (from backend/):

```text
npm test -- --runInBand --runTestsByPath src/feezback/feezback-spouse.spec.ts src/feezback/feezback-jwt.spouse.spec.ts src/feezback/feezback-connection-state.spec.ts src/feezback/feezback.controller.spec.ts src/feezback/feezback.service.direct-card.spec.ts src/feezback/feezback.service.admin-date-range.spec.ts src/transactions/user-sync-state.service.spec.ts src/feezback/consent/open-banking-connection.spec.ts src/feezback/consent/feezback-consent-api.service.spec.ts
```

9 suites / 78 tests passed, exit 0. Provider-failure tests intentionally log mocked errors.
`npm run build`: Nest build passed, exit 0.

Frontend (from frontend/):

```text
npm run ng -- test --watch=false --browsers=ChromeHeadless --include=src/app/pages/billing/open-banking/open-banking.page.spec.ts --ts-config=tsconfig.feezback-spouse.spec.json --karma-config=karma.feezback-spouse.conf.js
```

13 tests passed in ChromeHeadless on port 9877, exit 0.
`npm run build`: Angular production build passed, exit 0, hash a14134920a1c3597.
Warnings: CSS/initial-bundle budgets and CommonJS dependencies. npm also warned that the host Node 24 differs from the frontend's declared Node 20 engine.
`git diff --check`: passed.

An initial Jest name-filter run matched the entire worktree path, so it was stopped and replaced by exact --runTestsByPath runs. It reported an unrelated bookkeeping failure; no repository-wide pass or pre-existing-failure classification is claimed.

Environment: independently installed backend/frontend dependencies with npm ci. Copied the primary backend/.env, verified identical contents by hash and verified Git ignore. The tracked landing environment file already existed and was preserved. No secrets/build output/dependencies are staged. Main remained clean on main.

The app could not attach this manually created checkout as a managed worktree (reported: checkout exists but is not a managed worktree). Code and all validation ran in the dedicated feature worktree; automatic chat/worktree attachment remains unavailable.

Review notes: provider requests derive SUBs from the authenticated UID; the API accepts only boolean spouse selection. Only the data-ready webhook plus valid consent/source verification can set the permanent flag. Schema SQL is prepared, not executed. No production database, live consent, outbound email, real provider mutation or deployment was used for validation. Manual provider sandbox scenarios are listed in docs/features/feezback-spouse.md.
## Authorized DEV schema update (2026-10-15)

At Elazar's explicit request, verified the environment points to keepintax-dev
before connecting, then verified SELECT DATABASE() returned keepintax-dev.
MySQL version: 8.0.37-google. The spouse column was absent.

Executed only this DEV schema change, with a 10-second metadata lock timeout:

```sql
ALTER TABLE `user`
  ADD COLUMN `hasSpouseFeezbackIdentity` tinyint NOT NULL DEFAULT 0,
  ALGORITHM=INSTANT;
```

Post-change information_schema verification confirmed COLUMN_TYPE=tinyint,
IS_NULLABLE=NO, COLUMN_DEFAULT=0. No provider identities or consents were created,
no application boot/synchronize was used, and no production database was accessed.
This supersedes the initial handoff's statement that the SQL had not yet run for DEV;
production application of the supplied cutover SQL remains pending.

## Local frontend API port — mandatory pre-merge gate (2026-10-19)

Elazar clarified that local work must continue on backend port 3001 NOW.
The earlier change to 3000 was premature and has been reversed; desktop and
mobile environment files are restored exactly to their prior 3001 versions.

- [ ] BEFORE MERGING: change desktop and mobile local API URLs from 3001 to 3000, verify the diff, and complete applicable checks before integration.

Do not make this port change during ongoing feature development. Production/cloud
API URLs remain unchanged. The previous port-only commit's build passed; this
correction restores the prior files exactly and was verified by diff comparison.

## Approved source identity refactor (2026-10-20)

Elazar requested connectionRole on source and a foreign key from sync state,
clean account identifiers, and preserving all existing DEV connections/data.
Added cache.sourceRecordId as well to preserve bill associations when spouses
have identical account/card number labels. APIs/UI use the permanent source ID
for individual retries and association; role is derived through source.

DEV migration applied with backend paused, a Git-ignored local snapshot, strict
database-name guards, and before/after SHA-256 comparisons of unchanged fields.
31 sources / 21 sync / 658 cache / 355 slim / 0 legacy rows preserved. Two spouse
sources and two valid FKs; zero orphan links or suffixed account labels. Provider
SUBs, consent/resource IDs and opaque external transaction IDs were preserved.
No production access or provider requests were performed for this refactor.

Backend and frontend builds passed. Focused tests include same-number identity
isolation, own-SUB retry routing, rejection of ambiguous/foreign source IDs,
bill backfill isolation, direct-card safeguards and provider duplicate matching.
Full command/count evidence is added after final verification below.

Local API remains 3001. The mandatory pre-merge gate above remains open.

### Final verification for source-record refactor

- Backend: 13 focused Jest suites / 98 tests passed. After completing admin
  source metadata/routing, reran the three affected suites: 37 tests passed,
  including one added same-resource-ID/two-identity regression.
- Frontend: 21 isolated ChromeHeadless tests passed using the documented
  open-banking spec/config. Angular production build passed after final admin
  UI changes; CSS/bundle-budget and CommonJS warnings remain.
- Nest build passed; latest watch compilation also reported zero errors.
- DEV migration verification passed again after backend startup: counts and
  hashes preserved, zero invalid links or suffixed account identifiers.
- Backend watcher restored on 3001 with synchronize=false and boot seeding
  disabled; protected GET /transactions/sync-status returned HTTP 401.
- Snapshot, backend/.env and both key files verified ignored by Git.
- Primary checkout remained clean on main. Feature remains on
  codex/feezback-spouse; no merge/push/deploy performed.
- Schema/accounting impact: two source-record FKs and a source role/index;
  existing bill links, slim classifications and financial values preserved.
  Data backfill is transactional; MySQL DDL is not globally transactional,
  so the ignored before-snapshot is retained for recovery. No billing/provider
  contract changes. Existing external transaction keys retain their suffix
  to preserve import idempotency. Cross-identity deduplication remains outside scope.
