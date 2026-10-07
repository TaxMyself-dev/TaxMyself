# KT-049 — Canonical paid plan change

- Status: COMPLETE
- Authorization: Elazar approved implementation; no push.
- Branch: codex/billing-debt-recovery
- Base: 862337d644b654b3dd2abe2a5edb3f04227c3e3b
- Scope: ACTIVE paid plan changes through existing CHECKOUT obligations,
  hosted capture, card storage, receipt and completion/recovery.
- Preserve full target-plan charge without proration and existing anchor.
- Acceptance: reject same-plan checkout, pending payments and due renewal;
  block scheduled renewal while a hosted plan change is unresolved; verified
  capture applies only to its frozen source plan/period, exactly once;
  repeated completion never extends service or creates another invoice.
- No schema, live provider, dev data, production or parallel chat changes.
- Required verification: billing Jest suites and Nest build; documentation.

## Verification and limits

- Billing Jest: 25 suites / 377 tests passed (exit 0).
- After adding two reservation/renewal regression cases, focused orchestration:
  42 tests passed (exit 0). All changed executable code was covered by the
  suite run; subsequent source adjustment was indentation only.
- Nest build passed (exit 0). Initial sandbox build could not unlink dist;
  rerun with narrowly scoped filesystem permission succeeded.
- No frontend code changed: existing LowProfile return context is reused.
- Diff reviewed; no schema or live provider/database changes. No push.
- Live user upgrade/E2E remains unexecuted; requires billing backend 3001,
  frontend 4201, active ngrok and an ACTIVE paid dev subscription.
- Existing anchor/full-price behavior preserved. Pending/abandoned hosted
  checkout intentionally blocks renewal until verified or resolved in admin.
- Backend billing topic documentation updated.
