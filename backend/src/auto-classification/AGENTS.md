# Automatic classification

See ../../../docs/features/assistant-auto-classification.md for the approved
behavior, schema gates, API/UI and load limits.

- Owner-only, user-wide consent. Never infer it from chat, a delegate scope or
  the banking return URL. Unknown/skipped onboarding fields block the business.
- Reuse TransactionProcessingService's accounting and rule matching. Background
  calls pass permanent mode only, no override and no unbounded backfill.
- Do not hold DB locks across model calls. Revalidate state under the existing
  owner/cache/slim transaction boundary; an outcome must roll back with writes.
- The MySQL advisory lock uses a dedicated connection until release. Never
  replace it with a process-local-only mutex in multi-instance deployments.
- Keep strict model schemas, exact purpose evidence, uncertainty refusal,
  category/private consistency and bounded full input. No confidence threshold
  alone authorizes a write.
- Keep notifications owner-scoped and read state separate from resolution.
- Schema scripts do not run on boot. Tests accept only disposable local MySQL.
