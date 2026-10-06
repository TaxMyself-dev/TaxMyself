# KT-041 — Immediate PAST_DUE access blocking

- Status: WORKER_COMPLETE — local commit only, integration pending
- Task manager / implementer: Codex
- Worktree: C:/Users/user/.codex/worktrees/billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base: 9de690b8
- Approval: Elazar explicitly approved immediate blocking after the third
  failed renewal attempt and retaining debt settlement/card replacement access
  on 2026-10-06. Local code/tests/docs/commit only.

## Acceptance and scope

- PAST_DUE direct module access is empty immediately, regardless of legacy
  gracePeriodEndsAt; access.gracePeriodActive is false.
- Existing first/second confirmed-decline retries and transition on the third
  are preserved. Other existing causes of PAST_DUE (e.g. unusable saved card)
  also block by status; this task does not change retry classification.
- Existing verified professional-access overrides are unchanged.
- Authenticated debt checkout and payment-method endpoints remain free of
  subscription module gates and keep owner authorization.
- Recovery page exposes the existing card-change dialog for PAST_DUE owners,
  even when debt preview requires review. Card-only replacement neither pays
  the debt nor removes the block. Canceled card changes remain unsupported.
- No schema/data changes: legacy grace dates remain stored but grant no access.
  No database/provider calls, deployment, push or changes to NEW-AI-CHAT.

## Verification

- Access service, renewal decline-policy and controller focused suites passed:
  45 tests initially; controller rerun after adding four authenticated billing
  exemption cases passed 9/9, for 49 passing distinct backend tests.
- Frontend recovery 5/5 passed, including card-dialog opening despite failed
  debt preview and override rejection. Initial isolated compilation exposed a
  pre-existing transitive console import; billing-only test config now includes
  installed Node types. No dependency or lockfile change.
- Nest and Angular production builds passed. Existing Angular budget/CommonJS
  warnings remain; frontend build 93.007 seconds. Sandbox output/cache writes
  required narrow build/test escalations after actual EPERM failures.
- Staged diff reviewed; git diff --check passed. Topic docs synchronized.
- No live DB/provider/E2E tests were run, no schema or external API change.
  Existing KT-040 SQL is still unapplied and requires separate approved testing.
- This policy immediately blocks existing PAST_DUE owners even if their legacy
  grace date is in the future; user explicitly authorized this behavior.
