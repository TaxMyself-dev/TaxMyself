# Signup subscription transaction fix
- Status: WORKER_COMPLETE
- Branch: codex/signup-subscription-fix
- Base commit: 41fe53a964af01299380fdfef4b87f9f1470e5dd
## Acceptance criteria
- Persist signup trial in the same transaction without billing presentation reads.
- Keep billing trial API response unchanged.
- Missing enrollment subscription returns 500; signup shows actual server message and preserves Firebase translations.
- No schema, production data, accounting, authentication policy or provider operations.
## Verification
Passed (exit 0):
- backend: npm test -- --runInBand --runTestsByPath src/billing/services/billing-trial-creation.spec.ts src/billing/services/billing.service.spec.ts src/billing/services/open-banking-enrollment.service.spec.ts src/billing/billing.controller.spec.ts (99 tests).
- backend: npm test -- --runInBand --runTestsByPath src/billing/services/billing-trial-creation.spec.ts src/users/users.signup-phone.spec.ts (12 tests after adding UsersService coverage).
- backend: npm run build.
- frontend: npm run build -- --configuration production.
- frontend: npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/services/auth-signup-errors.spec.ts --ts-config=tsconfig.signup-check.json (4 tests). Temporary config extended tsconfig.spec.json, included only this spec and declarations, and added node to types; removed afterward.
- git diff --check.
The normal frontend test command failed compiling unrelated specs (removed async helper, stale component exports, missing Node types). Reproduced on base 41fe53a9 with original frontend executable sources restored temporarily, TypeScript --noEmit against the original spec configuration excluding the new spec: exit 2 with identical errors. Restored all fix sources afterward.
No live registration/provider/database test performed. Dependencies independently installed; npm warned that host Node 24 differs from frontend requested Node 20. Backend .env copied from primary and verified ignored. Other local env file found was landing/.env.development, already tracked and unchanged.
Documentation: billing, users and register topic AGENTS.md updated.
Schema / production data / accounting / authorization / external API impact: none; intentional HTTP status correction for missing enrollment subscription from 409 to 500.
Manual check: register a fresh account locally and verify a rejected signup shows its server message.
 Main contains unrelated untracked app-mapping/; preserve it and do not integrate while dirty. No push without Elazar manual verification and explicit approval.
