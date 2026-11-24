# AI module screens

`/ai` is the main-menu entry for chat, owner onboarding and agent automation.
Use existing module entitlements, never ADMIN role checks or email allowlists.
Every AI route has AuthGuard, BillingGuard and ModuleAccessGuard with AppRoute.AI.
Unauthorized routes redirect silently; the backend is authoritative.

AiAutomationPage reuses MyAgentComponent and mounts it only in the owner's
context. Keep existing settings and notification deep links working. The
main AI menu is hidden in represented-client context; onboarding and automatic
classification remain self-service even if chat uses an authorized delegation.
Do not move internal admin/provider tools into this area.

See docs/features/ai-module.md for subscription rules and operator guidance.
