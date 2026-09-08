# Production and schema policy

## Production access

Codex managers and workers must not obtain, test, or use production access.
They must not query the live production database, inspect live services, deploy,
restart services, invoke live webhooks, or request production credentials.

Pushing `main` is source delivery only and is never a production deployment.

## Schema and data changes

- Any schema, migration, cutover SQL, or production-data change requires
  Elazar's explicit approval before implementation or execution.
- The categories/accounting redesign has no automatic migration runner. Every
  approved production schema/data change must follow the binding redesign plan
  and be appended to `docs/redesign/cutover.sql` when that plan requires it.
- Development may use only explicitly authorized development databases or
  isolated production copies and must follow their documented safeguards.
- Never start the full Nest application against `keepintax_prodcopy` without
  `NODE_ENV=production` and `SKIP_BOOT_SEED=true`.

## External systems

Changing credentials, paid services, production callbacks, API contracts, or
live webhook configuration requires explicit approval. Local mocks, unit tests,
and documented manual test procedures remain allowed within task scope.
