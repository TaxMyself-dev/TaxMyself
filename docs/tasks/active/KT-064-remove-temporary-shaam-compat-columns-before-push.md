# KT-064 - Remove temporary SHAAM compatibility columns before push

- Status: `DEFERRED_BY_OWNER`
- Created: 2026-10-14
- Owner: primary integration manager
- Trigger: execute immediately before the first push containing KT-063, after
  every developer using the shared `keepintax-dev` database has switched to
  the new server-only SHAAM code.

## Owner decision — 2026-10-15

Elazar explicitly deferred removal of the three legacy `business` columns.
They remain nullable `select:false` compatibility declarations and must stay
unused by all SHAAM runtime code. Do not run the guarded
`--drop-legacy-columns` migration or remove the declarations as part of the
current invoice-allocation production work. Reopen this cleanup only after the
shared DEV server and old worktrees have all moved to the new server-only
connection model.

## Why this task exists

KT-063 removed `business.shaamAccessToken`, `business.shaamAccessTokenExp` and
`business.shaamRefreshToken`. They were temporarily restored as nullable,
empty compatibility columns in the shared dev database because another active
branch still loads them through its older TypeORM `Business` metadata.

The new code does not read or write these columns. They are temporarily present
in `Business` with `select: false` solely to prevent TypeORM synchronize from
dropping them while old branches remain active. Tokens live only in
`shaam_connection` and never pass through browser code.

## Deferred cleanup checklist

When Elazar reopens this cleanup, all items below must pass:

- [ ] Confirm no active developer checkout connected to `keepintax-dev` still
      declares or reads the three legacy columns.
- [ ] Confirm the integration tree contains no legacy access-token endpoint,
      browser bearer-token relay, process-local SHAAM state map, or references
      to the three `Business` properties other than the explicitly temporary
      `select:false` compatibility declarations.
- [ ] Remove the three temporary `select:false` declarations from
      `business.entity.ts`.
- [ ] Run the guarded dev migration with
      `--apply --drop-legacy-columns` against `keepintax-dev`.
- [ ] Verify all three new tables exist and the legacy-column count is zero.
- [ ] Run SHAAM focused tests and the backend build.
- [ ] Perform a signin and `/billing/me` smoke test using the new code.
- [ ] Only then allow commit/integration/push. Production remains governed by
      Section 23 of `docs/redesign/cutover.sql` during the coordinated deploy.

## Safety

The migration script refuses database names containing `prod`. The temporary
columns contain no recovered tokens; reconnecting to SHAAM remains required.
