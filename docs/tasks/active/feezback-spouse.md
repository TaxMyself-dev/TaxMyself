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
- Source identifiers: secondary source and transaction keys end in _spouse; primary keys stay unchanged.
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

## Local frontend API port (2026-10-19)

At Elazar's request, restored desktop and mobile development API URLs from port 3001 to port 3000 before integration. Production/cloud environment URLs are unchanged.

Validation: no 3001 references remain in frontend environment files; git diff --check passed; frontend npm run build passed (exit 0), with bundle/CSS budget and CommonJS warnings.
