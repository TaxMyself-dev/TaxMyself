# Referral-signup feature — production database change list

Consolidated list of every production database change introduced by the
accountant-referral-signup feature and all follow-up fixes, derived fresh
from the code/entities/migrations on this branch (`eharel-branch-0`) as of
commit `42f4ddb1`, cross-checked against the live `keepintax-dev` schema for
drift. Not part of the categories/accounting redesign
(`docs/redesign/`) — independent feature, independent rehearsal.

Intended use: rehearse against `keepintax_prodcopy` first, then run against
production by hand (e.g. via phpMyAdmin). Every statement below is plain
SQL — none of it requires `synchronize` or a running app.

## 1. Schema changes

**`user` table** — from `user.entity.ts` (commit `1709a09a`), confirmed
matching live `keepintax-dev` via `INFORMATION_SCHEMA`:

| Column | Type | Nullable | Default |
|---|---|---|---|
| `referral_code` | `varchar(32)` | YES | `NULL` |

Plus a unique index `ux_user_referral_code` on that column.

**`delegation` table** — from `delegation.entity.ts` (commit `4bb30544`):
- New unique index `ux_delegation_agent_user` on `(agentId, userId)`. Does
  **not** replace the existing `ux_delegation_agent_external` index on
  `(agentId, externalCustomerId)` — both coexist.

**Nothing else.** Every commit in the full feature range
(`dcaad7c8..42f4ddb1`, phase 0 through the live-resolution fix) was
filtered to `*.entity.ts` and `migrations/`/`*.sql` paths — exactly these
two entity files and two migration scripts touched anything
schema-related. `Subscription` and `SubscriptionPlan` entities were never
modified; `planId`, `isPublic`, `isActive`, `modules`, `features` all
pre-existed.

## 2. Data seeds — `subscription_plan`

Pulled directly from `keepintax-dev` on 2026-08-10. All other columns match
the original seed migration exactly (`modules`, `is_active`, `is_public`,
`trial_days`, `display_order`, `description` unchanged). The
`price_monthly_agorot=2500` value and the shared plan name were confirmed
as intentional current state (not the originally-documented `2458`/distinct
names — both were changed via a live edit on `keepintax-dev` after the
original seed and confirmed deliberate).

```sql
INSERT INTO subscription_plan
  (slug, name, description, price_monthly_agorot, currency, modules, trial_days, is_active, is_public, display_order)
VALUES
  ('referral-basic',
   'מסלול לקוחות רואה חשבון',
   'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪29 לחודש כולל מע"מ.',
   2500, 'ILS', '["INVOICES","EXPENSES","ACCOUNTANT"]', 30, 1, 0, 100);

INSERT INTO subscription_plan
  (slug, name, description, price_monthly_agorot, currency, modules, trial_days, is_active, is_public, display_order)
VALUES
  ('referral-open-banking',
   'מסלול לקוחות רואה חשבון',
   'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪59 לחודש כולל מע"מ, כולל חיבור בנקאי פתוח (Open Banking).',
   5000, 'ILS', '["INVOICES","EXPENSES","ACCOUNTANT","OPEN_BANKING"]', 30, 1, 0, 101);
```

`id`, `created_at`, `updated_at` deliberately omitted (auto-increment /
`CURRENT_TIMESTAMP(6)` defaults) — matches the original migration script's
own pattern. `slug` already has a pre-existing unique constraint
(`ux_subscription_plan_slug`, not part of this feature), so re-running this
against a database that already has these rows fails loudly rather than
duplicating.

**Known inconsistency, not fixed here:** `referral-basic`'s `description`
text still says "₪29 לחודש" but the actual price (2500 agorot) is ₪29.50
incl. VAT — a copy/price mismatch left as-is pending a decision.

## 3. Existing column, new dependency — `User.hasOpenBanking`

No schema change. `hasOpenBanking` (`tinyint NOT NULL DEFAULT 0`) already
exists in production. What's new: as of commit `42f4ddb1`,
`BillingService.getPlans()` and `createCheckout()` now **read it live** to
decide which referral plan a user sees/purchases, and `createCheckout()`
can **write** `subscription.planId` based on it. Production has never had
checkout behavior depend on this column before — worth a pre-flight sanity
check that existing production rows have sane values (should already be
true, since Feezback consent is the only writer), but no migration action
is needed.

## 4. Full execution order

```sql
-- 1. User schema
ALTER TABLE `user` ADD COLUMN `referral_code` VARCHAR(32) NULL DEFAULT NULL;
ALTER TABLE `user` ADD UNIQUE INDEX `ux_user_referral_code` (`referral_code`);

-- 2. Delegation schema — safety check first (should return 0 rows)
SELECT agentId, userId, COUNT(*) AS row_count
FROM delegation
GROUP BY agentId, userId
HAVING COUNT(*) > 1;
-- If that returns any rows, STOP — do not run the next statement.

ALTER TABLE delegation ADD UNIQUE INDEX ux_delegation_agent_user (agentId, userId);

-- 3. Data seed
INSERT INTO subscription_plan
  (slug, name, description, price_monthly_agorot, currency, modules, trial_days, is_active, is_public, display_order)
VALUES
  ('referral-basic', 'מסלול לקוחות רואה חשבון',
   'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪29 לחודש כולל מע"מ.',
   2500, 'ILS', '["INVOICES","EXPENSES","ACCOUNTANT"]', 30, 1, 0, 100);

INSERT INTO subscription_plan
  (slug, name, description, price_monthly_agorot, currency, modules, trial_days, is_active, is_public, display_order)
VALUES
  ('referral-open-banking', 'מסלול לקוחות רואה חשבון',
   'תוכנית ייעודית להרשמה דרך קישור הפניה של רואה חשבון — ₪59 לחודש כולל מע"מ, כולל חיבור בנקאי פתוח (Open Banking).',
   5000, 'ILS', '["INVOICES","EXPENSES","ACCOUNTANT","OPEN_BANKING"]', 30, 1, 0, 101);
```

Columns precede the indexes that reference them (User steps 1→2); the
delegation duplicate check precedes its `ALTER TABLE` since that check is
the actual enforcement mechanism now that production has `synchronize`
disabled. Table order (user → delegation → subscription_plan) is
arbitrary — no FK relationship between these three changes.

## 5. Confirmed: no `synchronize`, no running app required

Every statement above is plain SQL, safe to run by hand in phpMyAdmin. Both
migration scripts (`2026-08-09_add-delegation-agent-user-unique-index.ts`,
`2026-08-09_seed-referral-plans.ts`) are literal thin wrappers — their
`ALTER TABLE`/`INSERT` bodies are reproduced directly above; the
review/apply gating and idempotency checks in those scripts are for the
dev-run workflow, not schema logic. The `user.referral_code` column,
however, has **no migration script at all** — it was applied purely via
TypeORM `synchronize: true` in dev and never captured as SQL anywhere in
the repo; the statements above are derived directly from the entity
decorator and confirmed to exactly match dev's live schema.
