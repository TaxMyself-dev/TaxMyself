# Accountant Referral Signup — Pre-Implementation Investigation

Read-only investigation to map existing code before designing the "accountant referral
signup" feature: an accountant shares a unique signup link; a new (or existing) user who
signs up through it gets a two-tier paid subscription (₪29 / ₪59 with open banking),
a free trial without requiring a card up front, forced card entry after 30 days via
CardCom, and full-access delegation to that accountant created automatically.

No files were modified as part of this investigation.

---

## 1. Delegation model

### 1.1 Schema

`backend/src/delegation/delegation.entity.ts:1-37`

```ts
export enum DelegationStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity()
@Index('ux_delegation_agent_external', ['agentId', 'externalCustomerId'], { unique: true })
export class Delegation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string; // client's Firebase UID

  @Column({ type: 'varchar' })
  agentId: string; // accountant's Firebase UID

  @Column({ type: 'varchar', nullable: true })
  externalCustomerId: string | null; // always null today — no live producer

  @Column({ type: 'enum', enum: DelegationStatus, default: DelegationStatus.ACTIVE })
  status: DelegationStatus;

  @Column({ type: 'simple-array', nullable: true })
  scopes: string[]; // e.g. ['DOCUMENTS_READ', 'DOCUMENTS_WRITE']
}
```

- `userId`/`agentId` are plain `varchar` Firebase UIDs — **no TypeORM relation or FK** to `User`. Resolution is done manually via `userRepository.find({ where: { firebaseId: In(...) } })`.
- The unique index is on `(agentId, externalCustomerId)`, not `(agentId, userId)` — since `externalCustomerId` is always `null`, this index does **not** prevent duplicate accountant↔client rows. Duplicate protection today is done manually in application code (e.g. `grantViewPermissionByEmail` checks for an existing row before insert).
- `REVOKED` exists as an enum value but is never assigned anywhere — ending a delegation today means deleting the row (`delegationRepository.remove`), not soft-revoking it.

### 1.2 Scoped vs. all-or-nothing

Graded on exactly one axis — **view vs. edit** — expressed as a flat string array, not a real permission model:

- Only two scope values are ever used: `'DOCUMENTS_READ'`, `'DOCUMENTS_WRITE'`.
- Enforcement is generic and HTTP-verb based, not per-module (`backend/src/guards/firebase-auth.guard.ts:100-105`):

```ts
const scopes = hasPermission.scopes ?? [];
const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
if (isWriteMethod && !scopes.includes('DOCUMENTS_WRITE')) {
  throw new ForbiddenException('לרואה חשבון הרשאה לצפייה בלבד');
}
```

A `DOCUMENTS_WRITE` delegation can write *anywhere* in the app on that client's data; there's no per-module (expenses vs. reports vs. documents) distinction. A legacy row with `scopes = null` is treated as read-only.

- Visibility of the accountant's shared bookkeeping catalog is explicitly **not** gated by scopes at all (`backend/src/bookkeeping/catalog-context.service.ts:11-20` — "scopes gate CAPABILITIES (writes), not visibility (D9)").
- Everything outside read/write (which modules an accountant can touch — reports, documents, bookkeeping, annual reports, accountant-tasks) is gated purely by "does an ACTIVE delegation exist," i.e. all-or-nothing once a delegation exists.

Grant paths and the scopes they assign:

| Flow | Scopes granted |
|---|---|
| `createClientByAccountant` (manual add) | `['DOCUMENTS_READ', 'DOCUMENTS_WRITE']` (full) |
| `grantPermission` (JWT invite/approve) | `['DOCUMENTS_READ', 'DOCUMENTS_WRITE']` (full) |
| `grantViewPermissionByEmail` (`grant-view`) | `['DOCUMENTS_READ']` (view-only) |

### 1.3 Guards/services that check delegation status

- **`FirebaseAuthGuard`** (`backend/src/guards/firebase-auth.guard.ts:1-123`) — the central one. Reads `x-client-user-id` header; if present, either the caller is `ADMIN` (bypass, no delegation needed) or an `ACTIVE` `Delegation` matching `{userId: client, agentId: caller}` must exist, else `ForbiddenException`. On success it swaps `request.user.firebaseId` to the client's ID (impersonation) and applies the write-scope check from §1.2. Applied per-route via `@UseGuards(FirebaseAuthGuard)` across nearly every feature module — not global.
- **`DelegationController.getUsersForAgent`** — self-or-admin check via `actorFirebaseId` (`delegation.controller.ts:56-73`).
- **`CatalogContextService`** (`backend/src/bookkeeping/catalog-context.service.ts`) — `accountantIdsForUser`, `activeClientIdsForAgent`, `isAccountantOrAdmin`; feeds merged chart-of-accounts visibility and accountant-only bookkeeping endpoints.
- **`ReportWorkflowService.assertAccess` / `assertReportedActor`** (`backend/src/report-workflow/report-workflow.service.ts:315-361`) — self or active-delegation agent; a client can self-report "reported" status only if they have *no* active accountant delegation.
- **`AnnualReportService.assertAccess` / `setReported`** (`backend/src/annual-report/annual-report.service.ts:167-247`) — same pattern; `setReported` is accountant-only.
- **`AccountantTasksService.assertActiveDelegation`** / **`TasksGeneratorService`** — task generation/listing gated on active delegation.
- **`SharedService.isRepresentedByAccountant`** (`backend/src/shared/shared.service.ts:35-46`) — true only if delegate is `ACTIVE` **and** holds `UserRole.ACCOUNTANT`.
- **`UsersService`** — `getActiveAccountantEmailsForUser`, `backfillDelegatedClients`, `allowedEmailsForFolder`/`revokeAccountantDriveAccess` — drive Google Drive folder sharing off delegation state.

### 1.4 Manual "accountant adds client" — full path

`POST /delegations/create-client`

1. `delegation.controller.ts:109-127` — `@UseGuards(FirebaseAuthGuard)`, requires caller `usersService.isAccountant(firebaseId)`.
2. DTO `CreateClientByAccountantDto` (`delegation/dtos/create-client-by-accountant.dto.ts`): `email` (required), `phone` (required), `fName`, `lName`, `id`, `dateOfBirth`, `businessType`, `businessName`, `businessNumber`, `address`.
3. `DelegationService.createClientByAccountant` (`delegation.service.ts:392-542`):
   - Rejects if a `User` with that email already exists (409) or a `Business` with that `businessNumber` exists.
   - Creates a **Firebase Auth user** (`admin.auth().createUser`) with password `"KE" + digits-only phone`.
   - In one `dataSource.transaction`: inserts `User`, calls `usersService.ensureTrialSubscription(firebaseId, manager)`, inserts `Business`, inserts `Delegation` (`status: ACTIVE`, full scopes).
   - On any transaction failure, deletes the orphaned Firebase Auth user (Firebase isn't part of the DB transaction).
   - Fire-and-forget: provisions Google Drive folders and shares with the accountant.

This is the closest existing analogue to "signup creates a delegation," and its transactional pattern (User + Subscription + Business + Delegation, with Firebase-user rollback on failure) is the template to reuse for referral signup.

### 1.5 Invitation/token mechanisms already present

Two independent, differently-complete mechanisms exist:

- **JWT invite/approve** (`POST /delegations/invite`, `GET /delegations/approve-delegation`): `generateDelegationToken` (`delegation.service.ts:99-103`) signs `{userId, agentId}` with `jwt.sign(payload, process.env.JWT_SECRET)` — **no `expiresIn` set**, so tokens never expire. No DB "pending" row is created; the invite exists only inside the signed token until `grantPermission` verifies it and inserts an `ACTIVE` delegation directly. This flow is **unauthenticated at the controller level** (no `FirebaseAuthGuard`), derives caller identity from a raw header rather than `Authorization: Bearer`, and doesn't verify the caller is an accountant — looks legacy/superseded.
- **Instant grant-view** (`POST /delegations/grant-view`, guarded): looks up the target user by email (must already exist), dedupes against an existing delegation, then immediately inserts `ACTIVE` with view-only scopes and emails a notification. No token, no pending state.
- There is **no `PENDING`/`INVITED` status** anywhere on `Delegation` — both flows either fail (target doesn't exist / already exists) or write `ACTIVE` synchronously. Dead commented-out code for an even earlier ID-based grant/revoke design sits at `delegation.controller.ts:147-180`.

---

## 2. Subscriptions

### 2.1 Schema

`Subscription` — `backend/src/billing/entities/subscription.entity.ts:20-96`, table `subscription`, one row per user, unique on `firebaseId` (**no FK to `User`** — linkage is by string match, per an explicit SQL comment).

| Column | Notes |
|---|---|
| `firebaseId` | unique (`ux_subscription_firebase`) |
| `planId` | FK → `subscription_plan.id`, nullable (null during trial) |
| `paymentMethodId` | FK → `payment_method.id`, nullable until first payment |
| `status` | enum `SubscriptionStatus`, default `TRIAL` |
| `trialStart` / `trialEnd` | |
| `currentPeriodStart` / `currentPeriodEnd` | |
| `nextBillingDate` | indexed with `status` |
| `gracePeriodEndsAt` | PAST_DUE grace window |
| `renewalAttempts` | default 0 |
| `canceledAt` / `endedAt` | |
| `discountPercent` / `discountAmountAgorot` | mutually exclusive |
| `discountStartDate` / `discountEndDate` | |

`SubscriptionStatus` (`billing/enums/billing.enums.ts:1-7`): `TRIAL`, `TRIAL_EXPIRED`, `ACTIVE`, `PAST_DUE`, `CANCELED`.

`SubscriptionPlan` (`entities/subscription-plan.entity.ts`): `slug` (unique), `name`, `description`, `priceMonthlyAgorot`, `currency`, `modules: ModuleName[]`, `licensedDealerPriceMonthlyAgorot`, `features`, `badge`, `recommended`, `trialDays` (default 14), `isActive`/`isPublic`/`displayOrder`, soft-delete.

`PaymentMethod`: `firebaseId`, `cardcomToken` (encrypted), `last4`, `cardBrand`, `cardExpiryMonth/Year`, soft-delete.

`BillingEvent`: append-only audit log (`CHECKOUT_CREATED`, `PAYMENT_SUCCESS`, `RENEWAL_FAILED`, `PLAN_CHANGED`, etc.).

Note: `backend/scripts/migrations/2026-06-01_billing_foundation_schema.sql` shows a broader original design (`promotion`, `coupon`, `coupon_redemption`, `subscription_discount`, `subscription_cancellation`, `subscription_plan_change`, `cardcom_checkout_session`) that has **no corresponding live entity today** — only `subscription_plan`, `subscription`, `payment_method`, `billing_event`, `cardcom_webhook_log` are implemented. Dev DB uses `synchronize: true`; no migration runner exists.

### 2.2 Binary or multi-tier?

**Already multi-tier**, not binary. `SubscriptionPlan` is a full admin-managed catalog (CRUD at `POST/PATCH /admin/billing/plans`); `Subscription.planId` points to exactly one plan at a time. No plans are hardcoded/seeded — whatever tiers exist today are whatever's in the DB. Module differentiation uses `ModuleName` (`backend/src/enum.ts:15-20`): `INVOICES`, `OPEN_BANKING`, `EXPENSES`, `ACCOUNTANT`. What *is* binary/enumerated is `Subscription.status` (5 values above) — that drives lifecycle access, independent of tier.

This means the planned **₪29 / ₪59-with-open-banking** two-tier structure maps directly onto creating two `SubscriptionPlan` rows, the ₪59 one including `ModuleName.OPEN_BANKING` in its `modules` array — no schema change needed for the tiering itself.

### 2.3 The subscription-status guard and the "undefined status" bug

`SubscriptionGuard` (`backend/src/guards/subscription.guard.ts:16-52`):

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const firebaseId = request.user?.firebaseId;
  if (!firebaseId) throw new ForbiddenException('Missing user ID in request context');

  const requiredModule = this.reflector.getAllAndOverride<ModuleName>(
    REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()],
  );
  if (!requiredModule) return true;

  const hasAccess = await this.billingService.hasModuleAccess(firebaseId, requiredModule);
  if (!hasAccess) {
    throw new ForbiddenException({ statusCode: 403, code: 'MODULE_ACCESS_REQUIRED', module: requiredModule, ... });
  }
  return true;
}
```

This delegates to `SubscriptionAccessService.resolveModulesAccess`, whose `switch (subscription.status)` has always had `default: return []` — the **backend** guard fails closed on an unrecognized status and never had the bug.

The actual **undefined-status bug was in the frontend** guard, `frontend/src/app/shared/guard/billing.guard.ts`, fixed in commit `2510cdd6`:

```diff
- const status = billingState.subscription?.status;
+ const status = this.billingStateService.effectiveStatus();
```

Because `subscription` was `null` when a subscription row was missing entirely, `status` was `undefined`, and `if (!status || !BILLING_BLOCKING_STATUSES.includes(status)) return true;` incorrectly **granted access** in exactly the case it should have blocked. The fix routes through `effectiveStatus()`, which resolves a synthetic `SUBSCRIPTION_MISSING` status into the blocking set.

Related backend hardening the same day: `getMyBillingState()` now returns `{ hasSubscription: false, status: 'SUBSCRIPTION_MISSING' }` explicitly instead of silently auto-healing a missing row into a new trial; a dedicated `POST /billing/resolve-missing-subscription` remediation endpoint was added, guarded only by `FirebaseAuthGuard` (not `SubscriptionGuard`, since it must work with zero subscription rows).

### 2.4 Trial-period logic

Trial exists and is the default state for every new subscription:

```ts
// billing.service.ts:182-232, ensureTrialSubscription
const trialEnd = new Date(now);
trialEnd.setDate(trialEnd.getDate() + Number(process.env.TRIAL_DAYS));
subscriptionRepo.create({ firebaseId, status: TRIAL, planId: null, paymentMethodId: null, trialStart: now, trialEnd });
```

Idempotent and race-safe (catches `ER_DUP_ENTRY` on the unique `firebase_id` index and returns the winning row). Expiry enforced two ways: lazily on access (`enforceSubscriptionLifecycle` flips `TRIAL`→`TRIAL_EXPIRED` once `trialEnd < now`) and via a daily batch (`expireOverdueTrials()`).

Recent admin additions (commit `a9ab6b62`) — directly relevant since the referral feature needs a "30-day free, then forced card" trial variant:

- `PATCH /admin/billing/subscriptions/:id/trial-end` + `UpdateSubscriptionTrialEndDto { trialEnd?: string | null }` — lets an admin move a subscription's trial end date manually.
- `PATCH /admin/billing/subscriptions/:id/plan` + `UpdateSubscriptionPlanDto { planId?: number | null }` — lets an admin (re)assign a plan without touching status/dates.

These are admin-triggered today, not self-serve — the referral flow would need its own (non-admin) code path to set `trialEnd = now + 30 days` at creation time and enforce forced-card-entry once expired (see Gaps).

---

## 3. CardCom integration

### 3.1 Files

- **`cardcom.service.ts`** — LowProfile API v11 wrapper: `createLowProfileCheckout()` (`Operation: 'ChargeAndCreateToken'` or `'CreateTokenOnly'`), `getLowProfileResult()` (independent server-side verification via `GetLpResult`), `chargeByToken()` (`Transactions/Transaction`, charges a stored token directly, no hosted page — used by renewal), `getTransactionInfoById()` (backfills card last4/brand/expiry).
- **`cardcom-webhook.controller.ts`** — `POST /billing/cardcom/webhook`, no auth (public/CardCom-facing), always returns `{ok:true}`/200 even on internal error to avoid CardCom retry storms.
- **`cardcom-webhook.service.ts`** — parses `ReturnValue` (`intent: 'CHECKOUT' | 'CHANGE_PM'`), computes an idempotency key, logs to `cardcom_webhook_log` (dedup gate), **always re-verifies independently via `GetLpResult`** (never trusts the webhook body alone), then routes to `processVerifiedSuccess`/`processVerifiedFailure` (CHECKOUT) or `applyVerifiedChangePaymentMethod` (CHANGE_PM, touches only the stored token). Also exposes `reconcileChangePaymentMethod()` as a polling fallback for missed webhooks.
- **`subscription-renewal.service.ts`** — nightly `@Cron('0 3 * * *', {timeZone:'Asia/Jerusalem'})`: finds `status=ACTIVE AND nextBillingDate<=NOW()`, row-locks (`pessimistic_write`), decrypts the token, calls `chargeByToken()` directly. Success advances the period + resets `renewalAttempts`; failure retries after 3 then 7 days, and after `MAX_RENEWAL_ATTEMPTS=3` moves to `PAST_DUE` with a 14-day `gracePeriodEndsAt`.
- **`billing.service.ts`** — orchestration: `createCheckout()`, `changePaymentMethod()`, `getChangePaymentMethodStatus()`, trial/lifecycle management.
- **`admin-billing.service.ts`/controller** — plan CRUD, discount/trial-end/plan overrides, manual renewal triggers that reuse the exact renewal code path for testing.
- **`billing-token-encryption.util.ts`** — AES-256-GCM encrypt/decrypt of the CardCom token, keyed by `BILLING_TOKEN_ENCRYPTION_KEY`; decrypted value is documented as never to be logged/returned/stored outside the single charge call.
- **`cardcom-webhook-log.entity.ts`** — idempotency-keyed persisted webhook log.

### 3.2 Recurring billing status

**Already implemented, not manual/one-off.** The nightly cron charges the stored token monthly via `Transactions/Transaction` with no customer interaction — a mature system with idempotency (`renewal:{subscriptionId}:{YYYY-MM}`), row locking, retry/grace-period/PAST_DUE lifecycle, and admin manual-trigger parity for testing.

### 3.3 Tokenization approach

CardCom-hosted tokenization exclusively — **raw card data never touches this backend**. A LowProfile checkout (hosted page/iframe) returns a `TokenInfo.Token` GUID via webhook/`GetLpResult`; that token is AES-256-GCM encrypted and stored in `payment_method.cardcom_token`. Only display metadata (`last4`, `cardBrand`, expiry) is stored in plaintext. Decryption happens only immediately before the renewal charge call.

### 3.4 "Add payment method without charging"

**This flow already exists**: `POST /billing/change-payment-method` creates a LowProfile with `Operation: 'CreateTokenOnly'` and `jValidateType: 2` (card validation only — explicitly no charge, no hold; a nominal ₪1 `Amount` is sent only because CardCom's schema requires the field, but J2 skips both charge and hold). The webhook's `CHANGE_PM` branch updates only `payment_method` + `subscription.paymentMethodId`, never subscription status/dates/plan, and never emits `PAYMENT_SUCCESS`.

**Caveat — important gap for referral signup**: this flow is currently gated to subscriptions already `ACTIVE` or `PAST_DUE` (`billing.service.ts:481-489`). There is **no existing "capture a card with zero charge during TRIAL" path** — today, the only way to attach a card before a trial ends is the full `ChargeAndCreateToken` checkout, which charges immediately. The referral feature's "free trial without card, forced card entry after 30 days" requirement needs either a relaxation of this gate to also allow `TRIAL`/`TRIAL_EXPIRED`, or a new endpoint reusing the same `CreateTokenOnly` mechanism for trial subscribers.

---

## 4. Signup flow

### 4.1 End-to-end trace

1. **Frontend** — `register.page.ts:551` (`handleFormRegister()`) builds `{personal, spouse, children, business}` and calls `authService.SignUp(formData)`.
2. `auth.service.ts:421` — `afAuth.createUserWithEmailAndPassword(...)` creates the **Firebase Auth** user.
3. `auth.service.ts:428-429` — stores `uid`, sends verification email.
4. `auth.service.ts:435-438` — sets `formData.personal.firebaseId = uid`, `POST auth/signup` with the full `formData`.
5. `auth.service.ts:441-448` — if the backend call throws, best-effort deletes the just-created Firebase user (not transactional with Firebase — a separate cleanup-on-catch, distinct from the DB-transaction fix below).
6. **Backend** — `users.controller.ts:27-31`, `POST /auth/signup` → `UsersController.createUser(@Body() body: any)` → `UsersService.signup(body)`. Note: **no DTO exists for signup today** — `body: any`.
7. `UsersService.signup` (`users.service.ts:77-275`) opens `dataSource.transaction(...)`:
   - Saves `User`.
   - Calls `ensureTrialSubscription(saved.firebaseId, manager)` → `BillingService.ensureTrialSubscription`, joining the same transaction manager.
   - Saves `Child[]` and `Business[]` rows (with a friendly duplicate-business-number check).
   - After commit: fire-and-forget `provisionDriveStructure(savedUser)` (Google Drive folders — deliberately outside the transaction since it's a network call).

Save order: **Firebase Auth user → `User` → `Subscription` (via `ensureTrialSubscription`) → `Child`[] → `Business`[]**, all but the Firebase user atomic in one transaction.

### 4.2 The "atomic signup" fix

Commit `1358d1a1` (2026-08-03), with `f0ed4651` and `b69c71ea` as same-day support commits. Bug per the commit message: *"signup() saved the User row and then called ensureTrialSubscription() as a separate, unguarded statement — if that (or the child/business saves after it) threw, the User row was already committed with no Subscription and no way back."*

Fix: `UsersService` now injects `DataSource`, wraps the whole sequence in one `dataSource.transaction`, and uses `manager.getRepository(...)` throughout instead of injected singleton repos. `ensureTrialSubscription` was changed to accept an optional `manager?: EntityManager` and pass it through to `BillingService.ensureTrialSubscription`, which does `manager ? manager.getRepository(Subscription) : this.subscriptionRepo`. A second, independent race (two concurrent calls both passing the "does a subscription exist" check for a brand-new `firebaseId`) was hardened by catching `ER_DUP_ENTRY` and returning the winner's row instead of throwing.

This same atomic pattern (User + Subscription + Business + **Delegation**, with Firebase-user rollback on failure) is already reused in `DelegationService.createClientByAccountant` (see §1.4) — **this is the direct template** for a referral-signup transaction that also inserts a `Delegation` row.

Related same-day fixes: missing-subscription now surfaces as an explicit `SUBSCRIPTION_MISSING` state instead of silently auto-healing, plus a dedicated remediation endpoint (`POST /billing/resolve-missing-subscription`).

### 4.3 Where a referral token needs to be threaded through

**Confirmed: no referral/accountant-linking mechanism exists anywhere in signup today** (grep across the whole repo for `referral|referredBy|refCode|invite.?token|inviteCode` returns nothing). The delegation JWT-invite flow (§1.5) is unrelated — it links an *existing* user post-signup, not at account-creation time.

Threading points, in call order:

1. **Signup URL** — `app-routing.module.ts:146-149` has no query-param capture for `/register` today. A link like `/register?ref=<token>` would need `RegisterPage` to read `ActivatedRoute.snapshot.queryParamMap.get('ref')` in `ngOnInit()` and hold it for submission.
2. **Register form submit** — `RegisterPage.handleFormRegister()` (`register.page.ts:485-566`) would need to attach the captured token to `formData` before calling `authService.SignUp(formData)`.
3. **`AuthService.SignUp`** — no change needed; it already forwards the whole `formData` object as the POST body.
4. **Backend controller** — `UsersController.createUser(@Body() body: any)` — untyped today, so the token would just need reading off `body` (or formalized into a new `SignupDto` if one is introduced) and passed into `UsersService.signup(body)`.
5. **`UsersService.signup(...)`** — signature would need a `referralToken` field; inside the existing transaction, it would need to resolve the referring accountant (the delegation module's `jwt.verify(token, secret)` pattern at `delegation.service.ts:106-118` is a reusable model, though see Gaps re: replacing it with something safer) and insert a `Delegation` row analogous to `createClientByAccountant`'s (`delegation.service.ts:504-512`), inside the same transaction so it rolls back with everything else on failure.
6. Closest existing DTO shape to model a new one on: `CreateClientByAccountantDto` (§1.4).

### 4.4 Existing-user detection during a link-based flow

Two patterns exist, both in `DelegationService`, and **neither redirects to an alternate flow — both simply reject or no-op**:

- `createClientByAccountant` checks for an existing `User` by email *before* creating the Firebase user (`ConflictException`, "העסק כבר קיים במערכת"), mirrored by a Firebase-side `auth/email-already-exists` catch — this exists specifically so a duplicate doesn't orphan a Firebase account, which is directly relevant since referral signup will hit the same class of race.
- `grantViewPermissionByEmail` checks for an existing delegation (not user) and returns a friendly message instead of throwing if one already exists.

There is **no existing-user check inside `UsersService.signup` itself** — a duplicate would surface as a raw DB unique-constraint error, since Firebase's own `createUserWithEmailAndPassword` on the frontend is what normally rejects a duplicate email first (`auth/email-already-in-use`, handled generically in `getSignupErrorMessage`). **Nothing currently redirects an already-registered user who clicks a referral link into a "consent to this accountant" flow instead of re-registering — this must be built from scratch.**

### 4.5 Register page (brief)

`RegisterPage` (`register.page.ts`) is a multi-step wizard collecting personal/spouse/children/business or a shorter company-mode form, remapped into the same `personal`/`business` payload shape. `RegisterService` only exposes `getCities()`. Submission goes through `AuthService.SignUp` as traced above; on success it navigates to `/login` with router state that shows a "registered, please verify" modal.

---

## 5. Feezback / Open Banking

### 5.1 Overview

Feezback ("Pizbek") is the Open Banking (AISP) provider. Flow: `POST /feezback/consent-link` → user redirected to Feezback's hosted consent portal → Feezback calls back `POST /feezback/webhook` (unauthenticated, validated only by an `x-feezback-secret` header) → backend pulls bank/card accounts + transactions and normalizes them via `TransactionProcessingService`. Core files: `feezback.controller.ts`, `feezback.service.ts` (orchestration, `refreshUserSources`, flips `User.hasOpenBanking`), `feezback-jwt.service.ts`, `core/` (HTTP client, retry, auth), `api/`/`consent/` (Feezback API calls), `webhook/` (webhook controller/service/router).

### 5.2 Current gating

**A module-based gate exists but is inconsistently applied.** Mechanism: `@RequireModule(ModuleName.OPEN_BANKING)` (class-level metadata on `feezback.controller.ts:18`) is only enforced on methods that also chain `SubscriptionGuard` — the metadata is inert otherwise. `SubscriptionGuard` resolves access via `BillingService.hasModuleAccess` → `SubscriptionAccessService.resolveModulesAccess`, which returns the plan's `modules` array for ACTIVE/PAST_DUE(grace)/CANCELED(in-period), **all modules during TRIAL**, and none otherwise.

Only 3 of ~11 endpoints in `feezback.controller.ts` actually chain `SubscriptionGuard`: `consent-link`, `user-accounts`, `transactions`. Several debug/diagnostic endpoints pull the same data with weaker or no gating:

- `analyze-transactions-structure`, `transactions-structure`, `saved-transactions-files` — `FirebaseAuthGuard` only, **no subscription check** — any authenticated user can reach the same underlying data via these routes regardless of plan.
- `debug-token` — **no guard at all** currently (`@UseGuards(FirebaseAuthGuard)` is commented out), hardcoded firebaseId.
- Admin endpoints (`admin-user-transactions`, `admin/accounts/:firebaseId`, `admin/refresh-sources/:firebaseId`, `admin/pull-source/:firebaseId`) — `FirebaseAuthGuard` + manual `isAdmin` check, independent of subscription tier by design.

Frontend mirrors the same `ModuleName.OPEN_BANKING` concept (`access-control.ts`, `ModuleAccessGuard`, `AccessHandlerService`) for UI gating on the connect button, `/transactions` and `/flow-analysis` routes, the open-banking table, and the permissions tab — but this is UI-only convenience and doesn't protect the backend by itself.

### 5.3 What changing the gate to a specific tier requires

Since `TRIAL` already grants every module, and the module-inclusion model (`SubscriptionPlan.modules`) is already generic, gating open banking behind the planned ₪59 tier requires no new mechanism — only:

1. Ensure the ₪59 plan's `modules` includes `OPEN_BANKING` and the ₪29 plan's does not.
2. Add `SubscriptionGuard` to the currently-ungated debug endpoints (`analyze-transactions-structure`, `transactions-structure`, `saved-transactions-files`) so they can't be used to bypass the tier check.
3. Fix or remove `debug-token` (currently no auth guard at all, hardcoded firebaseId — looks like a leftover dev endpoint).

### 5.4 Frontend entry points

- `feezback.service.ts` — HTTP wrapper (`createConsentLink`, `getUserAccounts`, `adminGetAccountsAndCards`, etc.).
- `my-account.page.ts` — the real end-user entry point (`connectToOpenBanking()`, gated via `AccessHandlerService.handleFeatureAccess(AppFeature.OPEN_BANKING_CONNECT)`), plus the full consent-dialog/webhook-await flow.
- `trans-management.component.ts` (admin panel) and `clients-dashboard.component.ts` (accountant/admin) — internal diagnostic/testing surfaces, not gated by subscription tier by design (admin tooling).

---

## GAPS / WHAT'S MISSING for the referral-signup feature

**1. Unique-per-accountant link generation/storage**
Nothing exists. No `referral`/`refCode`/`inviteToken` concept anywhere in the codebase (backend or frontend). Needed: a persisted per-accountant referral identifier (simplest: a column on `User` for accountants, e.g. `referralCode`, or a small new table if you want revocable/rotatable/multi-link-per-accountant support), an endpoint to fetch/generate it, and a `?ref=<code>` query param convention on `/register` (no query-param handling exists on that route today — see §4.3).

**2. Existing-user detection + redirect to a delegation-consent flow**
Confirmed absent. The only "already exists" handling in the codebase (`createClientByAccountant`, `grantViewPermissionByEmail`) *rejects* rather than *redirects* (§4.4, §1.5). For referral links, you need new logic: detect (pre-Firebase-signup, ideally via a backend "does this email already have an account" check, since Firebase's own duplicate-email error only fires *after* attempting `createUserWithEmailAndPassword`) that the visitor already has an account, then route them to a consent screen that creates a `Delegation` for the referring accountant on an *existing* user — a flow with no current analogue; the closest building block is the instant `grantViewPermissionByEmail` pattern (§1.5), but that grants view-only and has no "accountant proposes, user accepts" step. You'll likely need a real pending/consent state, which doesn't exist today (no `PENDING` status on `Delegation` — see §1.1/§1.5).

**3. Two-tier subscription schema (₪29 / ₪59 with open banking)**
Mostly already supported (§2.2) — `SubscriptionPlan` is already a multi-tier catalog with a `modules` array, and `OPEN_BANKING` is already a defined `ModuleName`. What's missing is just: creating the two actual plan rows (none are seeded/hardcoded anywhere), and closing the gating gaps in §5.2/§5.3 so the ₪29 tier can't reach open-banking data through the ungated debug endpoints.

**4. Free trial without card + forced card entry after 30 days via CardCom**
Partially supported, with one real gap. Trial-without-card already works by default (`ensureTrialSubscription` never requires a payment method). Admin-only endpoints already exist to set a specific `trialEnd` and assign a `planId` (§2.4) — but there's no *self-serve* equivalent invoked automatically at referral-signup time (e.g., "set this new trial subscription's `trialEnd` to +30 days and pre-assign the referral plan"). More importantly, **"add card without charging" (`change-payment-method`, §2.3/§3.4) is currently gated to `ACTIVE`/`PAST_DUE` subscriptions only** — a `TRIAL` subscriber cannot use the existing zero-charge tokenization flow to attach a card ahead of forced entry. This gate needs to be relaxed for `TRIAL`/`TRIAL_EXPIRED`, or a parallel endpoint added, before "enter your card, we won't charge until day 30" is buildable. The "forced" part (blocking app access once day 30 hits with no card) can likely reuse the existing `TRIAL_EXPIRED` lifecycle transition and `SubscriptionGuard`/`billing.guard.ts` blocking-status logic (§2.3) with `TRIAL_EXPIRED` added to `BILLING_BLOCKING_STATUSES` if not already there — worth double-checking that list explicitly, as it wasn't fully enumerated in this pass.

**5. Full-access delegation auto-creation on signup**
No signup code path creates a `Delegation` today — only the accountant-initiated `createClientByAccountant` flow does (§1.4). However, that flow is the exact template to adapt: it already demonstrates User + Subscription + Business + Delegation created together inside one DB transaction, with Firebase-user rollback on failure. The referral-signup transaction in `UsersService.signup` (§4.1/§4.2) would need to be extended to also insert a `Delegation` row (`status: ACTIVE`, full `['DOCUMENTS_READ','DOCUMENTS_WRITE']` scopes, `agentId` = the accountant resolved from the referral token) inside the same transaction that already creates `User`/`Subscription`/`Business`/`Child`. Because delegation scopes are all-or-nothing per client (§1.2), "full-access" here is just the existing full-scope grant — no new permission modeling needed for that part.

**Secondary items worth flagging, not asked for explicitly but load-bearing:**
- The JWT delegation-invite token has no expiry (§1.5) — if any part of the referral flow reuses that signing pattern, this should be fixed (add `expiresIn`) rather than propagated.
- `Delegation` has no real FK/relation to `User` and no unique constraint on `(agentId, userId)` (§1.1) — worth deciding whether referral-created delegations should get proper dedup protection at the DB level rather than relying on application-level checks, especially since this feature increases delegation-creation volume and race exposure (self-registration is less controlled than an accountant manually adding one client at a time).
- No DTO exists for `POST /auth/signup` today (`body: any`) — introducing a `referralToken` field is a natural moment to also add a typed `SignupDto`.
