# Admin subscription plans and personal pricing

Plans can be created/edited with both business-type prices, capabilities, trial,
marketing copy, badge/recommendation and listing order. Stopping admission keeps
existing members and approved plan/enrollment changes working. Deletion is soft:
it rejects attached subscribers, open debts/unresolved attempts and pending
schedule/enrollment references. Existing payment history continues to resolve
the deleted plan name. Selecting a recommended plan clears the other recommendation.
Currency is ILS; catalog and personal net prices are capped at 1,000,000 ILS so
VAT-inclusive stored integer amounts remain bounded. Price impact counts classify
current subscribers into live, frozen and currently active personal price groups;
these are a current snapshot, not a promise of future enrollment counts.

## Price rules

LIVE (the default) follows the plan's business-specific price. FROZEN captures
that base at the time the administrator selects the policy, before discounts and
even if a personal price is currently active. It preserves only price; modules
always resolve from the current plan, including an explicitly empty module list.
The legacy null-module fallback is preserved. Saving the same plan/policy does
not reset a frozen price. An actual plan transition captures the new plan base
atomically; returning to an earlier plan does not resurrect its old frozen price.

An active personal monthly price takes priority, including zero, and survives
plan changes. It is the final amount before VAT; legacy discounts are suppressed
while it applies. Start/end dates are inclusive Asia/Jerusalem calendar dates;
no end means permanent. On expiry, frozen/live base and the existing discount
resume automatically. VAT is calculated by the existing billing engine.

Price changes affect future new charges only. Existing obligations, attempts and
approved banking-enrollment first-period terms remain immutable. The admin drawer
shows a saved debt or first-period agreement where applicable. The list's next
amount is a new-period estimate before VAT. Price mutations serialize on the
subscription row, reject unresolved payments/armed enrollment, and persist an
actor/before/after billing event in the same transaction. Fresh charge reservations
validate a fingerprint under that lock (policy, catalog price, business type and
Jerusalem pricing date), so a stale calculation cannot cross an admin save.
Live quotations at midnight may require refresh. Historical debt recovery does
not revalidate or reprice old terms.

A new zero-price service period advances the plan and period locally, without
CardCom, payment receipt or accounting entry. It writes ZERO_PRICE_PERIOD_V1
durable evidence for later proration. Saved zero-price banking first-period agreements are validated by their durable
ACTIVATE event ID under the subscription lock and honored without repricing.
It cannot bypass pending payments/debts or
an approved banking enrollment. Repeated or stale renewal calls are no-ops.

## Schema and operation

No live database, provider, cloud resource or production operation was run for
this feature. Before running the app against a database, manually inspect
`backend/scripts/migrations/2026-11-05_subscription_pricing_preflight.sql`, take
a backup, run the adjacent `_apply.sql` once (or only the dated 2026-11-05 section
in `docs/redesign/cutover.sql`, never both) against the explicitly selected
database, then `_verify.sql`. The migration adds six nullable/defaulted fields
and checks; it does not modify existing prices, discounts, debts or attempts.
Do not rely on TypeORM synchronize. Do not apply the SQL to production without
separate explicit authorization. Keep the schema additive on rollback: restore
old application code but retain columns/audit history; do not drop terms in use.

The feature worktree owns its independent dependencies and ignored backend env.
Use distinct ports, for example backend 3018/frontend 4218, if starting concurrent
servers. No server was booted during automated validation.

## Manual acceptance

1. Create a plan with distinct exempt/licensed prices and capabilities. Edit
   its description, recommendation and listing order; reload the public catalog.
2. With test users on LIVE/FROZEN/CUSTOM, inspect the impact counts, update the
   plan price and verify only LIVE's next new-period base changes. Change modules
   and verify all three users receive the current plan capabilities.
3. Enable FROZEN while custom pricing is active, end the custom window and verify
   the saved business-specific base and legacy discount return. Repeat a same-plan
   save; then change away and back, verifying each actual change resets the base.
4. Test permanent/temporary custom pricing, zero, a price above catalog, date
   boundaries, removing custom price and an attempted reversed/invalid date.
   Confirm net and VAT-inclusive estimates match checkout and renewal.
5. Verify zero-price initial activation and renewal never contact CardCom; a later
   upgrade can use the saved zero-period evidence. Test repeat renewal no-op.
6. Keep an old debt/nondeterministic payment pending, attempt admin pricing changes
   and verify they are blocked; verify retries retain original money amounts.
7. Stop new admission, verify new joins are blocked and existing members plus
   already scheduled changes continue. Attempt deletion with an attached member,
   pending enrollment/downgrade/open payment; verify rejection. Delete an unused
   plan and verify historical payment names/documents remain accessible.
8. Verify non-admin API requests fail, and administrative price/catalog/plan,
   discount and trial-end changes include the real actor and before/after audit.
9. Verify server error/partial save messages leave no stale editable drawer.

## Delivery boundary

Implementation and verification stay on feature branches. Elazar explicitly
requires approval before any local integration into main. After that approval,
GitHub push still requires his confirmation that he personally tested the current
local main revision and his explicit push approval. No main merge, push or deploy
is part of this worker's handoff.
