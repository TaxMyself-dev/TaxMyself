# KT-104 - Complete and integrate the Uniform File branch

- Status: `APPROVED`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `30c61a70`; reconcile with current `origin/main`

## Business outcome

Finish every locally verifiable part of the SHAAM Uniform File delivery in this
branch, preserve newer work already present on `main`, and deliver the combined
verified result to `main` without enabling production or sending taxpayer data.

## Acceptance criteria

- [ ] Reconcile the branch's Uniform File, SHAAM security, MFA and observability
      commits with current `origin/main` without regressing newer behavior.
- [ ] Preserve the fail-closed production boundary, server-only tokens and
      capabilities, owner/business authorization, idempotent submission state
      and the ZIP fallback.
- [ ] Close documentation and test gaps that can be completed locally; record
      portal, tsandbox, Firebase and Cloud configuration as explicit external
      gates rather than claiming they passed.
- [ ] Run the affected focused backend tests, backend build and frontend build;
      classify any frontend test-runner blocker accurately.
- [ ] Review the complete integrated diff, verify no secrets/build output/temp
      evidence are committed, then fast-forward and push `main` only if every
      applicable quality gate passes.

## Scope and constraints

- In scope: non-destructive integration, semantic conflict resolution, focused
  local fixes/tests/docs, task handoff, normal push after all gates pass.
- Out of scope: production deployment, production database access or cutover,
  real taxpayer submission, interactive SHAAM authorization, credential or
  portal changes, Firebase/Cloud resource mutation, and the untracked `output/`
  artifact owned by the user.
- Required reading: root instructions; coordination workflow, authority,
  quality gates, lessons and production policy; categories redesign master
  plan; SHAAM, reports, Uniform File and auth topic instructions; KT-061 and
  current `origin/main` KT-090.
- Approval boundaries: stop for a new schema, tax/accounting, external-contract,
  authorization-policy or materially different UX decision.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact:
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
