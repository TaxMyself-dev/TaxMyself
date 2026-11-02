# KT-066 - Admin document permission for demo users

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD plus the uncommitted KT-056 through KT-065 work
  (no commit will be created in this task)

## Business outcome

A system administrator using the admin panel's view-as action may create
documents for registered demo profiles, including the SHAAM allocation fixture,
without granting the same capability for real clients or to accountants.

## Acceptance criteria

- [x] Allow document navigation only when the real actor has `ADMIN` and the
      represented user was marked `isDemo=true` by the backend.
- [x] Keep admins viewing real clients blocked.
- [x] Keep accountants and other non-admin actors viewing demos blocked.
- [x] Do not infer demo status from a user-controlled email pattern.
- [x] Add focused policy tests and pass the Angular production build.

## Scope and constraints

- In scope: frontend dashboard action, document route guard, shared auth-policy
  helper, focused tests and nearest documentation.
- Out of scope: backend authorization expansion, schema changes, production,
  external SHAAM calls, commit, push and deployment.
- Backend business authorization remains authoritative for every API request.

## Handoff

- Result: dashboard navigation and the direct document route now share one
  policy: the real actor must be an `ADMIN` and the represented profile must
  carry backend-issued `isDemo=true`. Email patterns are no longer trusted.
- Commit hash(es): none requested.
- Changed files:
  - `frontend/src/app/services/auth.service.ts`
  - `frontend/src/app/services/auth.service.demo-impersonation.spec.ts`
  - `frontend/src/app/shared/guard/view-only-block-doc.guard.ts`
  - `frontend/src/app/shared/guard/AGENTS.md`
  - `frontend/src/app/pages/my-account/my-account.page.ts`
  - `frontend/src/app/pages/my-account/AGENTS.md`
  - `docs/tasks/active/KT-066-admin-demo-document-permission.md`
- Tests and exact results: the focused policy spec covers admin+demo allowed,
  admin+real blocked, accountant+demo blocked and spoofed demo email blocked.
  The repository Karma command could not execute because the existing spec
  compilation has unrelated missing Node typings and stale component specs;
  a direct `tsc -p tsconfig.spec.json --noEmit` rerun confirmed no error remains
  in the new spec. Angular production build passed with existing budget/CommonJS
  warnings.
- Known pre-existing failures: frontend spec compilation errors in `exceljs`,
  `tesseract.js`, missing `@types/node`, obsolete Angular `async` imports and
  several stale component spec class names.
- Schema / production / security / accounting / external impact: no schema,
  production or external-system change.
- Risks and manual checks: restart the frontend, re-enter the SHAAM demo from the
  admin panel, then verify both the dashboard card and direct `/doc-create` route.
- Documentation updated: my-account and guard topic docs plus this task file.

## Integration

- Reviewed by: pending user manual test.
- Integrated commit: none requested.
- Combined verification: Angular production build passed; focused test execution
  is blocked by the documented pre-existing frontend test-suite failures.
- `origin/main` verification: not applicable.
- User-visible run instructions: restart the frontend and use the existing
  admin-panel view-as action for `shaam-allocation-test`; direct login is no
  longer required for this demo-only flow.
