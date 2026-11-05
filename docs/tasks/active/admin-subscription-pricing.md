# Admin subscription plan and user pricing management

- Status: `IN_PROGRESS`
- Task manager: /root
- Worker: /root/implement (backend), /root/implement/ui (frontend)
- Worktree: C:/Users/user/Keepintax/TaxMyself-admin-subscription-pricing
- Branch: codex/admin-subscription-pricing
- Base commit: c15a7fff

## Business outcome

Admins can manage the catalog and each subscriber's plan, live/frozen pricing,
permanent/temporary final personal price and existing subscription controls.

## Acceptance criteria

- [x] Full plan editor, impact preview and safe soft deletion; deactivation preserves existing members.
- [x] LIVE/FROZEN business-specific base, automatic reset on actual plan transition; live capabilities.
- [x] Permanent/dated personal final net price, including zero, survives plan changes and does not stack discounts.
- [x] Canonical pricing and serialized audited updates; original debts and saved terms preserved.
- [x] Unified clear user drawer, validation, accurate current/next quote, honest partial-save handling.
- [ ] Backend focused regressions and build; isolated frontend regressions and production build.
- [x] Additive manual migration/preflight/verification and manual acceptance guide.

## Scope and constraints

- Schema files authorized by approved plan; no live schema/database operations.
- No tax/VAT rules, accounting behavior or external provider contract changes.
- Existing Firebase/admin role gates retained for all new routes.
- Local main integration requires Elazar's separate explicit approval (latest instruction).
- Push requires Elazar's manual test confirmation of current main and explicit push approval.
- No push, deploy or main write by worker.

## Handoff

- Result: pending tests/review.
- Validation: Nest build passed (exit 0). Broad billing run: 41/42 suites, 612/615 tests passed; sole failing resolution fixture was corrected, then its focused suite passed 28/28 (exit 0). Final six changed suites are running; root will record integrated final results. No failures classified pre-existing.
- Final focused command: npm test -- --runInBand --silent billing/services/admin-pricing.spec.ts billing/services/pricing-policy.spec.ts billing/domain/zero-price-period.spec.ts billing/services/open-banking-enrollment.service.spec.ts billing/services/billing-hosted-completion.service.spec.ts billing/services/admin-billing-resolution.spec.ts
- Latest focused session: 67176 (running at worker commit preparation).
- Source after successful build adds only unchanged-discount no-op semantics and its focused regression; root must compile exact integrated revision.
- Frontend commits prepared independently: b7398cb7 and eb63035d; 33/33 isolated tests and production build passed in UI worktree. Root owns cherry-pick into feature branch.
- Root-owned follow-up: plan catalog effectivePriceMonthlyAgorot must reflect personal/frozen base consistently with checkout; do not mark full feature complete until that follow-up and combined checks pass.
- Schema: six additive subscription price columns/checks; default LIVE preserves existing behavior.
- Risks: manual schema application required before app startup; no live DB/provider acceptance performed.
- Documentation: docs/features/admin-subscription-pricing.md and closest topic docs.

## Integration

- UI commit: pending cherry-pick by root into feature only.
- Main: untouched, awaiting user approval for local integration after feature review.
