# AI module

AI uses the existing subscription module mechanism (`ModuleName.AI`), independent
of the ADMIN role. `/ai` is the ordinary application's entry point, visible to
an entitled signed-in owner in the main navigation. It links to chat
(`/agent/chat`), onboarding (`/agent/onboarding`) and agent management
(`/agent/automation`: standing consent, classification progress and notifications).
Chat and onboarding no longer appear as admin-panel tabs. Each screen returns
to AI; notification deep links and existing personal-settings links remain valid.

## Authorization

All AI routes use authentication, billing and ModuleAccessGuard. Users without
AI are redirected to the account screen without an upgrade prompt. The internal
admin panel still requires AdminRouteGuard and the backend AdminGuard.

AgentAiGuard and OnboardingAiGuard authorize the real actor's persisted identity
and own BillingService.hasModuleAccess(actor, AI, false, false). Neither an admin
role, represented-owner subscription nor professional billing override grants
the actor AI. Guard names and domain methods express module access. Chat retains
its existing independent delegation/owned-business checks. Onboarding and
automation remain owner-only. The main AI menu and personal automation controls
are hidden while representing a client.

The classifier checks AI before reads/model work and rechecks its module grant
before committing the model result. Existing active open-banking module access,
connection, explicit consent, complete onboarding and source/business ownership
requirements remain independent. Revoked access pauses background processing
with AI_MODULE_REQUIRED. No accounting/classification semantics change.

## Granting access

In the admin subscription-plan editor, AI is an additional included-module
option. An ACTIVE user's plan must include AI. Editing a shared plan affects
every subscriber to that plan; use an appropriate private plan when granting a
specific demo account access, retaining its intended pricing and commitments.
Do not change billing state or assign a paid plan merely to expose AI.

Existing subscription policies are preserved: valid TRIAL and COMPLIMENTARY_FULL
include every module, now including AI. Expired trials and blocked subscriptions
do not gain AI. Existing legacy fallback for a missing plan is unchanged.
No new role, user field, schema migration, environment allowlist or hardcoded
email was added. Production plan/subscription configuration is a separate
explicit operation; this feature does not change any live account or deploy.

Document extraction already embedded in document upload is not an admin AI
screen and retains its existing expense/document module boundary. Internal
document-AI scheduler credentials and infrastructure remain internal.

## Manual checks after approved integration

Local worktrees also need the independent agent package prepared: run `npm ci`
and `npm run build` inside `backend/agent`. The Nest build does not build this
ESM package. Missing `backend/agent/dist/agent-http.mjs` produces
503 AGENT_UNAVAILABLE even when backend/.env contains all credentials.
From `backend`, `node scripts/check-agent-image.cjs` verifies the bundle through
the same loader used by AgentHarnessService, without serving an authenticated
request or calling a model. Failed loads retry on the next chat request.

- Entitled regular owner: AI main menu opens all three screens; admin panel denied.
- Owner without AI: no AI menu, direct AI routes and APIs denied.
- Grant/revoke AI: refresh subscription state; verify menu and direct APIs.
- Complete onboarding; enable classification only with banking and explicit consent.
- Open an agent notification, switch account/view-as, and check no prior-owner data remains.
- Check desktop/mobile RTL navigation and return links.

See `docs/tasks/active/ai-module.md` for exact automated verification evidence.
