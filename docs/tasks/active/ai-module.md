# AI subscription module and main navigation

- Status: `READY_FOR_REVIEW`
- Task manager/worker: Codex (single agent)
- Worktree: `C:\Users\user\Keepintax\TaxMyself-ai-module`
- Branch: `codex/ai-module`
- Base: local main `2eedefa7`, verified after fetching origin/main. Local main
  and origin/main diverge (10 local, 6 remote commits); no integration performed.
- Main has an unrelated untracked `backend/journey-timings.local`, preserved.

## Acceptance criteria

- AI is an included subscription module, selectable in the plan editor.
- Entitled regular owners can reach chat, onboarding and automation from AI in
  the main navigation. AI entries are removed from the admin console.
- Server-side authorization uses the real actor's own AI entitlement; ADMIN
  alone cannot bypass it. Existing ownership/delegation and banking gates hold.
- Automation refuses revoked AI access before model work and before writes.
- Unentitled users cannot access AI by direct URL/API; no new admin access.
- Focused authorization/navigation tests and both package builds pass.

## Plan and boundaries

Inspect subscription resolution and AI surfaces; introduce the module, guards
and ordinary navigation; verify denial, regular-owner access and revocation;
update topic docs and commit locally. No schema, live production, charges,
main integration, push or deployment. Production user existence is unverified.
Copied ignored backend/.env without exposing secrets; dependencies installed
independently. Local servers, if used, must use ports 4228/3028.

## Verification

Risk tiers: backend authorization/services plus frontend conditional visibility,
routing and service behavior. Both package production builds are required.
Tests ran on the feature working tree based on 2eedefa7; only source comments
and documentation changed after final executable checks. Evidence below is
several bounded runs, not a single full suite at one revision.

Backend diagnostic command (backend working directory), exit 0: 10 suites,
145 tests passed in 147.703s:

```powershell
npm test -- --runInBand --silent --testPathPattern="agent-ai.guard|agent-domain.service|agent-books.service|agent-harness.controller|agent-harness.access|onboarding-access|onboarding.service|auto-classification.service|auto-classification.http|subscription-access.service"
```

Additional module-policy check, exit 0: 1 suite / 3 tests (68.922s):

```powershell
npm test -- --runInBand --silent --testPathPattern="ai-module-access"
```

Final affected-case rerun after HTTP and revocation cases were consolidated,
exit 0: 4 suites / 43 tests (76.372s). Earlier unchanged domain, books, guard,
onboarding and subscription-resolution evidence is reused:

```powershell
npm test -- --runInBand --silent --testPathPattern="agent-harness.access|auto-classification.http|auto-classification.service|ai-module-access"
```

Final frontend command (frontend working directory), exit 0: 43 tests passed
in Chrome Headless 157 (3.337s browser execution, compilation additional):

```powershell
npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.ai-module.spec.json --karma-config=karma.auto-classification.conf.cjs --include="src/app/components/my-agent/*.spec.ts" --include="src/app/pages/ai/*.spec.ts" --include="src/app/pages/settings-new/settings-navigation.spec.ts" --include="src/app/pages/admin-panel/admin-panel.page.spec.ts" --include="src/app/pages/dev-agent/dev-agent.route.spec.ts" --include="src/app/pages/dev-agent/dev-agent-startup.spec.ts" --include="src/app/shared/guard/module-access.guard.spec.ts" --include="src/app/app.component.reconnect.spec.ts"
```

Both `npm run build` commands (backend and frontend), exit 0 on final executable
code. Frontend warnings: unused InboundEmailComponent, style/initial bundle
budgets, CommonJS optimization. These warnings were not reproduced on the base
and are not claimed as baseline-verified. No build failures remain. npm ci
completed independently in both packages; frontend's declared Node 20 engine
warned under installed Node 24.13.0. Karma warned about terminating Chrome after
successful completion; exit remained 0.

Initial frontend attempt omitted --include and loaded unrelated specs outside
its tsconfig; no tests executed. Corrected by specifying matching includes.
The next diagnostic had 37 pass / 1 failed: the new route test selected the
wrong shell with children. Reviewed and fixed its selector; subsequent runs
passed (41, then final 43 tests). No expectations or product access requirements
were weakened. No known baseline test failure is asserted.

`git diff --check` passed. backend/.env verified ignored; no secrets printed.
Standalone source-template visual fixtures rendered in Chrome at 1280x800 and
390x844, inspected at both sizes: RTL rows readable, no horizontal overflow.
Images are outside Git in the chat workspace deliverables/ai-module-*.png.
These are presentation fixtures, not an authenticated end-to-end acceptance test.

Skipped: full repository legacy suites (unrelated), live production/user lookup,
paid model calls, provider/banking callbacks, disposable-MySQL integration suite,
manual authenticated owner workflow. No local app server was started against
the copied environment and no live DB or external provider was invoked.

## Handoff

Implementation and automated verification complete; local commit prepared.
Main integration and GitHub push require Elazar's separate approvals. The
worktree stays available for review. Production designer-demo account remains
unchanged and its existence has not been verified.

Schema/production/accounting/external-contract impact: none. Security change:
AI uses the actor's own subscription entitlement instead of ADMIN. Trial/full
access inherits existing module policy. Changing a live plan would affect all
members and is explicitly outside this task. See docs/features/ai-module.md.
