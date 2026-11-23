# Feezback end-user activity IP

- Status: `VERIFIED`
- Task manager: current Codex chat
- Worktree: `TaxMyself-feezback-psu-ip`
- Branch: `codex/feezback-psu-ip`
- Base commit: `17961d37057db9dc5bafe0c63284f36953489c1b` (current local main; fetched origin/main is an ancestor, local main ahead 137 commits)

## Business outcome

Feezback recognizes an account holder accessing financial data and resets its
six-month inactivity timer. Automated background activity does not impersonate
an online account holder.

## Acceptance criteria

- [x] Authenticated owner foreground consent/account/card/transaction GETs carry the validated client IP through the proxy.
- [x] Login/manual async syncs retain their initiating owner context, including retries/pagination and spouse identity.
- [x] Cron/webhook/service calls without owner request context omit the header; concurrent users cannot mix context.
- [x] Admin/view-as/delegated access and different target identities do not count as account-holder activity.
- [x] Invalid/missing IPs are omitted; untrusted forwarding and incoming PSU headers cannot override server resolution.
- [x] Diagnostics redact the PSU IP and proxy preserves the explicit header.
- [x] Focused backend/proxy tests and Nest build pass. No production/provider calls, schema changes, main integration or push.

## Scope and constraints

User explicitly authorizes implementation in a separate worktree and dev-only
verification. Existing personal approval gates override automatic merge/push
instructions. Webhook delivery is a separate task. No authentication/delegation
policy or global Express trust-proxy change. Nearest Feezback/users/transactions
instructions and coordination workflow/quality gates reviewed.

## Handoff

Implemented and reviewed in the isolated branch. Owner-only async-local activity
is applied after Firebase guards and reaches exact owned Feezback data GETs;
proxy forwarding preserves it and diagnostics redact it. Webhook delivery,
business data, auth policy and global Express proxy trust are unchanged.

Validation tier: backend service/controller plus Feezback proxy boundary. Tests
ran on base 17961d37 plus the executable diff in this feature commit; no
executable changes followed the passing final checks. Evidence consists of
focused batches, not a repository-wide suite. Final checks passed; initial diagnostic failures are distinguished below.

From backend:

1. npm test -- --runInBand --runTestsByPath src/feezback/core/feezback-user-activity.spec.ts src/feezback/core/feezback-user-activity.http.spec.ts
   - Unit suite: 27 passed. Initial HTTP suite failed because the fixture used
     a default supertest import under CommonJS. Corrected to import-equals and
     reran only the affected HTTP suite with the command below.
2. npm test -- --runInBand --runTestsByPath src/feezback/core/feezback-user-activity.http.spec.ts
   - 7 passed, actual Nest controllers and loopback fake provider. Verified
     owner refresh/retry, login/manual async work, admin target isolation,
     view-as omission and admin empty-cache preparation omission.
3. npm test -- --runInBand --runTestsByPath src/feezback/core/feezback-transaction-logging.spec.ts src/feezback/core/feezback-token-expiry.spec.ts src/feezback/core/feezback-key-lookup-retry.spec.ts src/feezback/feezback.controller.spec.ts src/users/users.controller.spec.ts src/users/users.controller.banking-start.spec.ts src/users/users.controller.demo-sync.spec.ts src/transactions/transactions.controller.admin-sync.spec.ts src/transactions/transactions.controller.demo-sync.spec.ts
   - 9 suites / 76 tests passed, 38.191 seconds.
4. npm run build
   - Nest build passed. Does not start the application or connect to a DB.

From proxy:

- node --test body-parsing.test.js logging.test.js
  - 29 tests passed. Real loopback forwarding; no external requests. Existing
    util._extend deprecation warning and expected malformed-JSON rejection
    stack trace are non-failing test output.

Total: 110 backend tests and 29 proxy tests passed across focused batches.
An earlier diagnostic unit run found one incomplete auth mock (missing getTppId);
fixed the fixture and its pagination test passed in the next focused run. An
initial test-copy path error executed zero tests; no pass was claimed for it.
Backend/proxy npm ci completed independently in this worktree; npm printed
dependency deprecation warnings. No package/lockfile changes.

Verification scope: local dev and loopback fixtures only; copied backend/.env
was checked as keepintax-dev and git-ignored. No live DB query, Feezback call,
production connectivity, deployment, main integration or push was performed.
Frontend build/tests and repository-wide suites were not run because no
frontend behavior or unrelated module changed. No baseline failures remained
in the selected suites.

Security/external impact: only existing authorized provider GETs gain a
validated owner IP. Default direct requests ignore spoofable forwarding
headers; Cloud Run uses its appended client address. There is no additional configurable
hop-count setting. No schema/accounting impact.
No persistent local server was started, so concurrent dev ports are unchanged.

Documentation: nearest Feezback/users/transactions AGENTS files, proxy README,
and docs/features/feezback-user-activity.md. git diff --check and local document
link validation passed before commit.

Rollout limits: this does not restore a terminated consent, and local checks do
not prove Feezback's live timer updated. Before an authorized release, verify
the actual ingress hop chain and deploy backend/proxy through the normal
separate approval gates. No webhook delivery repair is included.

During work, another task advanced main from 17961d37 to 712db3ce and left an
untracked backend/journey-timings.local file. Both were preserved. At the original handoff this feature had not been combined with those newer
Scheduler changes; the combined verification recorded below supersedes that
limitation. Main integration was subsequently approved explicitly by Elazar for this feature;
GitHub push still requires his manual main test and separate push approval.

## Removal and authorized local integration — 2026-11-22

Elazar requested removing the optional hop-count setting and merging locally.
Removed its runtime branch, test configuration and documentation; local socket
and existing Cloud Run address selection remain fixed. No new environment
variable or schema change. Before integration, main launchers reported frontend
4200, backend 3000 and API http://localhost:3000/. Feature ports remain in its
ignored local configuration (4201/3001). Current main 712db3ce contains Scheduler
changes; combine those on the feature branch before final verification, preserve
main's existing untracked backend/journey-timings.local, and fast-forward main
only after checks pass. No push or production operation is authorized.

## Final combined verification

- Original feature: d7f22d0c. Optional-setting removal: 9c00d5b8.
- Current main 712db3ce was merged into the feature at 1c1d405d without conflicts.
- On 1c1d405d, the following backend command passed, exit 0: 11 suites,
  109 tests, 86.192 seconds. One obsolete configurable-hop test was removed,
  explaining the change from the original 110 tests.

  npm test -- --runInBand --runTestsByPath src/feezback/core/feezback-user-activity.spec.ts src/feezback/core/feezback-user-activity.http.spec.ts src/feezback/core/feezback-transaction-logging.spec.ts src/feezback/core/feezback-token-expiry.spec.ts src/feezback/core/feezback-key-lookup-retry.spec.ts src/feezback/feezback.controller.spec.ts src/users/users.controller.spec.ts src/users/users.controller.banking-start.spec.ts src/users/users.controller.demo-sync.spec.ts src/transactions/transactions.controller.admin-sync.spec.ts src/transactions/transactions.controller.demo-sync.spec.ts

- npm run build passed, exit 0, on the same combined executable revision.
- Proxy sources/tests did not change since the passing 29-test run recorded
  above; that evidence is reused. Frontend source/configuration is unchanged,
  so no Angular build or unrelated repository-wide suite was run.
- Only documentation changed after the passing checks. git diff --check and
  git show --check passed; the removed setting has no tracked references.
- Effective local main launchers were checked again: frontend 4200, backend
  3000, API http://localhost:3000/. Feature-only ignored settings still report
  4201/3001; no port or environment files are staged.
- Neither local .env contains the removed setting. No schema/migration change.
- The exact verified feature candidate plus this documentation-only record is
  authorized for a local main fast-forward; no push, deployment or production
  access. Existing untracked main journey timing configuration is preserved.
- Prior dev-only live proxy verification confirmed foreground header presence
  and direct background header absence. No new provider request was required
  for this removal; direct-local behavior is unchanged.
