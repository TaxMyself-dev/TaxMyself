# KT-090 - Mandatory MFA and owner-only SHAAM operations

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `1e899089f67398b445396a2d00b0a3d311e26c5e`

## Business outcome

Every Keepintax user must complete Firebase multi-factor authentication before
entering protected application functionality. Only the authenticated owner of
a business may connect that business to SHAAM or cause any request to be sent
to SHAAM; accountants and administrators viewing a represented client are
blocked server-side.

## Acceptance criteria

- [x] Firebase TOTP enrollment and second-factor sign-in are supported for
  email/password and Google first-factor login.
- [x] Protected backend routes can enforce a verified Firebase second-factor
  claim through an explicit rollout configuration.
- [x] Unenrolled users are routed to a dedicated MFA enrollment flow before
  protected backend/profile loading.
- [x] SHAAM OAuth authorization, invoice allocation/recovery, uniform-file
  transfer, and remote polling reject delegated and admin-impersonated access.
- [x] SHAAM callback cannot complete a state whose real actor is not the
  business owner.
- [x] Local uniform-file preparation/status viewing remains unchanged because
  it does not contact SHAAM.
- [ ] Focused backend tests, backend build and frontend build pass. A focused
  frontend guard spec was added, but the repository's Karma compilation is
  currently blocked by unrelated pre-existing spec/type errors before the
  selected test can run.
- [x] Topic documentation and required production configuration/manual steps
  are documented without committing secrets or `.env` files.

## Scope and constraints

- In scope: Firebase TOTP MFA UX and enforcement; owner-only external SHAAM
  boundary; tests and topic documentation.
- Out of scope: SMS delivery, account-recovery policy, production Firebase or
  Cloud Run mutations, audit-log/retention work, deployment.
- Required reading: root `AGENTS.md`, coordination workflow/authority/quality
  gates, SHAAM/guards/login/settings/shared-auth topic instructions.
- Approval boundaries: the user explicitly approved mandatory MFA for all
  users and explicitly prohibited accountants from connecting or sending to
  SHAAM for represented clients. No schema, production, or external-service
  change is authorized in this task.

## Handoff

- Result: Added Firebase TOTP enrollment/challenge UX, opt-in global frontend
  and backend MFA enforcement, and a server-authoritative owner-only boundary
  for every SHAAM operation that can make an external request.
- Commit hash(es): this task commit.
- Changed files: Firebase guard/tests; SHAAM controller/tests; business lookup;
  login/auth/MFA service and setup page; application/startup/login routing
  guards; environment flags; topic documentation.
- Tests and exact results:
  - Backend focused Jest: 2 suites, 45 tests passed.
  - Backend Nest build: passed.
  - Frontend production Angular build: passed with existing budget/CommonJS
    warnings.
  - Frontend focused Karma invocation: did not run tests because the global
    test compilation failed on pre-existing unrelated specs and missing Node
    typings.
- Known pre-existing failures: `ng test --watch=false --browsers=ChromeHeadless
  --include=src/app/shared/guard/auth.guard.spec.ts` compiles the repository's
  whole test program and fails on stale component names, removed Angular
  `async`, missing Node typings used by ExcelJS/Tesseract and other existing
  files.
- Schema / production / security / accounting / external impact: no schema or
  accounting change. Production remains unchanged because all frontend
  `requireMfa` flags and backend `AUTH_MFA_REQUIRED` default to false. Once
  enabled, protected backend routes require Firebase second-factor proof and
  delegated/admin-impersonated SHAAM external actions return 403.
- Risks and manual checks: before activation, enable Authentication with
  Identity Platform and TOTP in each Firebase project; deploy frontend with
  `requireMfa=true`; test enrollment and email/Google challenge with owner and
  accountant accounts; then set `AUTH_MFA_REQUIRED=true` in the matching
  backend service. Validate recovery/support procedure before requiring MFA
  for all production users.
- Documentation updated: backend guards, backend SHAAM, frontend login,
  frontend guards, and new MFA setup topic documentation.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
