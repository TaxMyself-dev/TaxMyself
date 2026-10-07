# KT-050 — Change plan entry point

- Status: COMPLETE
- Authorization: Elazar requested a change-plan option in My subscription.
- Branch: codex/billing-debt-recovery
- Base: 772cec065e1d6707ddd6183dcd1cc6a2844ee83c
- Scope: existing status card offers החלפת תוכנית for ACTIVE owners without
  billing overrides, navigating to /billing/plans. Reuse existing button styles.
- No backend, schema, data, charge, parallel worktree or push changes.
- Verification: Angular production build and diff review; no new tests for
  the simple navigation entry point.

- Angular production build: exit 0; existing bundle/style budget and CommonJS
  warnings remain. Sandbox dist unlink denial resolved by scoped build permission.
- Diff reviewed; settings topic docs updated. No live UI/payment run.
