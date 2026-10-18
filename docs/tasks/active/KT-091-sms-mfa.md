# KT-091 - Replace TOTP MFA with SMS MFA

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `207a58f9`

## Business outcome

Mandatory MFA uses a familiar SMS verification flow instead of requiring an
authenticator application. The existing backend second-factor enforcement and
owner-only SHAAM boundary remain unchanged.

## Acceptance criteria

- [x] An unenrolled verified user can consent, enter an Israeli or E.164 phone
  number, pass Firebase reCAPTCHA and enroll the SMS factor.
- [x] Email/password and Google first-factor logins can send and verify the SMS
  challenge for an enrolled user.
- [x] Phone numbers are sent directly to Firebase and are not stored by the
  Keepintax backend.
- [x] TOTP-specific UI/code/documentation is removed from the active feature;
  KT-090 retains a superseded implementation note for task history.
- [x] Frontend production build passes and relevant tests are added or the
  existing test-harness blocker is documented.
- [x] Required Firebase GUI, SMS region, billing and rollout steps are
  documented.

## Scope and constraints

- In scope: frontend Firebase SMS MFA enrollment/challenge flow, reCAPTCHA,
  validation, tests and topic documentation.
- Out of scope: production/DEV Firebase mutations, SMS provider replacement,
  account-recovery administration UI, schema changes and deployment.
- No change to backend `AUTH_MFA_REQUIRED` claim enforcement or SHAAM owner
  authorization policy is required.

## Handoff

- Result: Replaced the unactivated authenticator/TOTP flow with Firebase SMS
  MFA enrollment and sign-in, including explicit phone-processing consent,
  Israeli/E.164 normalization and invisible reCAPTCHA.
- Commit hash(es): this task commit.
- Changed files: MFA service/spec; enrollment page; login challenge; production
  rollout comment; login/MFA topic docs; KT-090 supersession note.
- Tests and exact results: frontend production Angular build passed. Three
  focused phone-normalization specs were added.
- Known pre-existing failures: the repository's Karma program still fails
  before selected specs run because unrelated legacy specs and Node typings do
  not compile; documented in KT-090.
- External/manual steps: in the matching Firebase project enable SMS
  Multi-factor Authentication, allow only Israel in SMS region policy, verify
  authorized domains and configure test phone numbers for DEV. Keep frontend
  `requireMfa=false` and backend `AUTH_MFA_REQUIRED=false` until enrollment and
  challenge are tested.
- Risks: SMS is weaker than authenticator MFA and creates billing/abuse risk;
  Firebase requires Cloud Billing and reCAPTCHA. Losing the enrolled phone can
  lock out a user until an administrator recovery process is implemented.
- Documentation updated: login and MFA setup topic docs plus production
  environment rollout comment.
