# Feezback end-user activity IP

- Status: `WORKER_COMPLETE`
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
headers; Cloud Run uses one appended hop, and extra controlled proxies require
the documented Feezback-specific hop setting. No schema/accounting impact.
No persistent local server was started, so concurrent dev ports are unchanged.

Documentation: nearest Feezback/users/transactions AGENTS files, proxy README,
and docs/features/feezback-user-activity.md. git diff --check and local document
link validation passed before commit.

Rollout limits: this does not restore a terminated consent, and local checks do
not prove Feezback's live timer updated. Before an authorized release, verify
the actual ingress hop chain and deploy backend/proxy through the normal
separate approval gates. No webhook delivery repair is included.

During work, another task advanced main from 17961d37 to 712db3ce and left an
untracked backend/journey-timings.local file. Both were preserved. This feature
remains on its original verified base; it has not been tested as an integration
with those newer Scheduler changes. Integration and push require Elazar's
separate explicit approvals.
