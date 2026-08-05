# QA access to `keepintax_prodcopy`

2026-07-12. Rehearsal-copy QA convenience only — **never added to
`cutover.sql`**, never touches any of the 9 real client businesses'
data. Needed because Elazar's day-to-day Firebase identity lives in a
**separate dev Firebase project** than the one production's real users
are registered under, so none of the copied-from-production `user` rows
can be signed into from a dev login. This note exists because
`keepintax_prodcopy` has already been re-imported from
`_prod_dump/keepintax-prod.sql` three times (see `worklog.md`) and will
be again — the QA admin row does **not** survive a re-import and has to
be recreated each time.

## What this is

One extra `user` row inserted directly into `keepintax_prodcopy` (raw
`mysql2`, bypassing NestJS/TypeORM entirely — same safe pattern used
throughout the 2026-07-12 incident recovery, so it can never trigger
`synchronize`):

- `firebaseId = LiVlGGxaC0hefnmw5LinOZvbjvc2` (Elazar's **dev** Firebase
  project UID for `harelazar@gmail.com`)
- `email = harelazar@gmail.com`
- `role = ADMIN`
- `businessStatus = NO_BUSINESS`, no `business` row of its own

No existing row is modified. In particular, `keepintax_prodcopy` already
contains a real production admin row (`user.index = 1`,
`firebaseId = JpIEJt3lSDMsI9uG67Etqx4ZbuC3`, same email) — that row and
its 2 real businesses are untouched. The new row shares the email but a
different `firebaseId`, which is the only thing anything in the backend
actually keys on (`user.email` has no unique index).

## Why this is enough — how impersonation works

`FirebaseAuthGuard` (`backend/src/guards/firebase-auth.guard.ts`) has an
admin bypass: any authenticated request whose caller is `role: ADMIN`
and carries an `x-client-user-id` header is allowed to act as that
`firebaseId`, no `delegation` row required. The frontend's
clients-dashboard "כניסה כמשתמש" ("enter as user") action
(`ClientsDashboardComponent.confirmEnterAsUser`) is exactly this
mechanism — `ClientPanelService.setSelectedClient()` stores the target
`firebaseId`, the auth interceptor attaches it as `x-client-user-id` on
every subsequent request. So logging in once as the new admin row is
enough to reach every one of the 9 real client businesses through the
normal UI, with no per-client Firebase account and no `delegation` rows
needed.

## Verified end-to-end (2026-07-12)

Booted the backend directly against `keepintax_prodcopy`
(`NODE_ENV=production DB_DATABASE=keepintax_prodcopy SKIP_BOOT_SEED=true`
— **both required**, see `CLAUDE.md` — on `PORT=3001` so it doesn't
collide with a normal dev server on 3000) and exercised the real HTTP API
with a real Firebase ID token minted for the new UID:

1. `GET /auth/signin?freshLogin=true` → 200. `role=["ADMIN"]`,
   `businessStatus=NO_BUSINESS`, `businessNumber=null` — no crash despite
   having zero businesses of its own (`UsersService.findFireUser`
   already handles an empty `business` result gracefully).
2. `GET /auth/all-users` → 200, 25 users (24 original + the new row).
   No subscription row is required for the admin's own account — the
   frontend's `BillingGuard` only blocks navigation when a subscription
   row exists AND its status is blocking; no row at all is treated as
   not-blocking.
3. `GET /business/get-businesses` with `x-client-user-id` set to each of
   the 8 distinct `firebaseId`s that own the 9 baseline businesses
   (`docs/redesign/baseline-reports-post-migration/*.json`) → 200 every
   time, correct business data returned, admin-bypass path confirmed (no
   `delegation` rows exist for this admin — none were needed).

**No backend code changes were needed to make the API work.** The gaps
flagged as possible risks going in — missing subscription row, missing
business row for the admin itself — are both already handled gracefully
by existing code. A real **frontend** bug surfaced once this was actually
clicked through in the browser — see below.

## Frontend bug found and fixed: stale billing/module-access state on impersonation

API-level verification above passed, but the real UI did not: after
"entering as user" from clients-dashboard, the bookkeeping tabs
(incomes/expenses) disappeared and their routes were unreachable — not a
QA-only issue, the same mechanism accountant delegation (Phase 5) uses.

Root cause: `BillingStateService.loadBillingState()`
(`frontend/src/app/services/billing-state.service.ts`) loads once and
caches forever (`if (this.billingState() !== null ...) return;`) until
`refreshBillingState()` is explicitly called. It gets loaded once for
whichever identity is active at app boot (the admin/accountant's own
account) and was **never invalidated when `ClientPanelService`'s selected
client changed** — `AppComponent.subscribeToSelectedClient()` already
correctly re-fetched `viewAsUserData` and `businesses` on every client
switch, but not billing state. Since `AccessService.canAccessModule()`
and `ModuleAccessGuard` both read straight from that cached
`BillingStateService` signal, every module-gated tab/route
(`book-keeping.page.ts`'s incomes/expenses tabs, `ModuleAccessGuard` on
`/book-keeping/incomes`, `/book-keeping/expenses`, `/transactions`, etc.)
kept evaluating against the admin's own (no-subscription) billing state
instead of the impersonated client's real one.

Fix: `AppComponent.subscribeToSelectedClient()` now calls
`billingStateService.refreshBillingState()` on every
`selectedClientId$` emission — both entering AND exiting client view (the
"exit" branch needed it too, otherwise leaving client view stayed stuck
showing the client's access instead of the accountant/admin's own).
Single fix point, covers every caller of `ClientPanelService.setSelectedClient()`
uniformly: admin clients-dashboard, `demo-data` component, and the
accountant's `clients-panel.page.ts` (`enterClient()`) — the actual Phase
5 path.

Verified via full typecheck + code-path trace (no browser-automation tool
available in this environment to click through live — flagged explicitly
rather than claimed as browser-tested). Recommend a quick manual
click-through (enter as a MULTI_BUSINESS client, confirm the bookkeeping
tab + expenses list + business selector all appear) before relying on
this for Phase 5 accountant testing.

## How to recreate after a future re-import

`keepintax_prodcopy` gets fully replaced (`DROP DATABASE` + fresh
restore) on every re-import, so this row is gone every time. To restore
it:

```bash
cd backend
MODE=apply node scripts/qa/seed-qa-admin-user.js
```

Idempotent — no-ops if the row already exists (checks by `firebaseId`
first). Default `MODE=review` prints what it would insert without
writing.

To re-verify the whole flow still works (login, all-users, 9-business
impersonation), boot the backend against the copy on a spare port and
run the checker:

```bash
cd backend
NODE_ENV=production DB_DATABASE=keepintax_prodcopy SKIP_BOOT_SEED=true PORT=3001 npx nest start
# in another shell, once it's listening:
node scripts/qa/verify-qa-impersonation.js
```

Both scripts mint the Firebase ID token in-memory via the existing
backend service-account credentials + the dev project's public Web API
key (same one already committed in
`frontend/src/environments/environment.ts`) — nothing is written to disk
or printed.

## Why this stays out of `cutover.sql`

`cutover.sql` is the literal set of statements applied to real
production at go-live. This row must never exist there — it is a
rehearsal-environment-only convenience tied to a dev Firebase UID that
has no meaning outside this copy.
