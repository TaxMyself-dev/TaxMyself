# Admin subscription plan and user pricing management

- Status: `WORKER_COMPLETE` — feature verified, awaiting explicit local-main integration approval.
- Task manager: /root
- Workers: /root/implement (backend), /root/implement/ui (frontend)
- Worktree: C:/Users/user/Keepintax/TaxMyself-admin-subscription-pricing
- Branch: codex/admin-subscription-pricing
- Base commit: c15a7fff

## Business outcome

Admins can manage the catalog and each subscriber's plan, live/frozen pricing,
permanent/temporary final personal price and existing subscription controls.
Authenticated plan cards use the personal/frozen price source while retaining
raw catalog prices. Existing discounts remain separate from a final personal price.

## Acceptance criteria

- [x] Full plan editor, impact preview and safe soft deletion; deactivation preserves existing members.
- [x] LIVE/FROZEN business-specific base, automatic reset on actual plan transition; live capabilities.
- [x] Permanent/dated personal final net price, including zero, survives plan changes and does not stack discounts.
- [x] Canonical pricing and serialized audited updates; original debts and saved terms preserved.
- [x] Unified clear user drawer, validation, accurate current/next quote, honest partial-save handling.
- [x] Combined backend regressions/build and isolated frontend regressions/production build.
- [x] Additive manual migration/preflight/verification and manual acceptance guide.

## Final combined verification — 2026-11-05

All commands ran in the feature worktree, with independently installed npm dependencies.

Backend (from backend):

```text
npm test -- --runInBand --testPathPattern="billing|users/(users.service|users.signup-phone).spec|guards/(subscription.guard|admin-endpoints-security).spec"
47 suites passed; 636 tests passed; exit 0; 410.691 seconds.
npm run build
Nest build passed; exit 0.
```

Frontend (from frontend):

```text
npm test -- --watch=false --browsers=ChromeHeadless --progress=false --karma-config=karma.admin-subscription-pricing.cjs --ts-config=tsconfig.admin-subscription-pricing.spec.json --include=src/app/shared/admin-billing/subscriptions/billing-subscriptions*.spec.ts --include=src/app/shared/admin-billing/plans/billing-plans.component.spec.ts --include=src/app/services/admin-billing.pricing.spec.ts --include=src/app/pages/billing/billing-plans.page.spec.ts
33 tests passed in real ChromeHeadless; exit 0.
npm run build -- --configuration production
Angular production build passed; exit 0; hash 88081430777fa79e; 185148 ms.
```

Existing budget/CommonJS warnings were also present in the successful unchanged
baseline build. npm reported the existing Node engine mismatch (installed Node24,
project requests Node20). Chrome logged shutdown timeout warnings after all 33
successful tests; the test command exited 0. No failing test is classified as
pre-existing. Mocked failure-path logs in Jest are expected.

Independent review covered price precedence/expiry, freeze transitions, debt
recovery, zero-period identity and banking-agreement authority, deletion/history,
admin authorization/audit, UI save behavior and the catalog display follow-up.
No outstanding blocking finding. Diff whitespace checks passed.

## Scope and operation

- Six additive subscription price columns/checks; default LIVE preserves existing behavior.
- Development migration applied to keepintax-dev on 2026-11-05 at Elazar's explicit request, after read-only preflight and a local schema/data backup. Six columns and four enforced CHECK constraints verified; 38 original subscription rows unchanged by SHA-256 comparison over every original column; zero invalid terms. Existing users default to LIVE with null overrides.
- Apply the standalone migration OR the dated new section, never both or the entire historical cutover file.
- keepintax-dev is ready for this version; do not reapply its SQL. Other databases still require separately authorized schema application.
- No CardCom/provider, production or cloud operation was performed. Only the explicitly requested development schema was changed.
- No tax/VAT rules or financial accounting calculations changed; zero service periods are not payment captures.
- Existing Firebase/admin gates are retained for all new routes.
- Local main integration requires Elazar's separate explicit approval.
- Push separately requires his personal test confirmation of current local main and explicit push approval.

## Integration and handoff

- Backend commit: 5934045f.
- UI commits b7398cb7 and eb63035d were reviewed and cherry-picked into this feature as 31d73c3b and 283ab53d.
- Root completed and verified the catalog price-display follow-up in this feature.
- Main was not modified by this task. Its checkout was clean at final inspection.
- Main independently advanced to a027d1c9 with an unrelated report test change; this feature remains based on c15a7fff.
- No merge/fast-forward into main, push, deploy or worktree cleanup was performed.
- Retain both feature/UI worktrees and local commits for review.
- Manual acceptance and schema instructions: docs/features/admin-subscription-pricing.md.