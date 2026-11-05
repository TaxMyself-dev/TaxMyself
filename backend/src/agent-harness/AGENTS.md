# agent-harness — the Nest edge of the AI agent (KT-089)

## Purpose

Serves `/api/agent/*` (the agent's chat, its stream, stop, steer and
follow-ups, and its server functions) by handing each request to the agent
package (`backend/agent`, an ES module) after `FirebaseAuthGuard`.

## Key pieces

- `AgentHarnessController` (`@All('api/agent/*')`): maps the guard's request
  to the agent's user (actor, data owner, business number, delegation scopes,
  delegated/admin flags), turns the Express request into a web `Request` with
  its raw body, and streams the agent's `Response` back unbuffered.
- `AgentHarnessService`: loads `backend/agent/dist/agent-http.mjs`
  (`AGENT_BUNDLE_PATH` overrides) on the first agent request, through a
  runtime dynamic import (this backend compiles to CommonJS); disposes the
  agent's runtime on shutdown. A missing bundle answers 503 and is retried on
  the next request; the rest of the backend is unaffected.
- `AgentDomainService`: KeepInTax's domain for the agent's tools, bound per
  request to the verified user. `requestBusiness` accepts the
  `businessnumber` header only when it is one of the data owner's numbered
  businesses (403 `AGENT_BUSINESS_FORBIDDEN`); `assertAccessStillHolds`
  re-checks the ACTIVE delegation (or the admin role) on every tool call;
  `queryExpenses` reads through `ExpensesService` (semantics in
  `backend/agent/GUIDE.md`, "queryExpenses").

## Invariants

- `main.ts` leaves `/api/agent/` bodies unparsed: the agent reads its body as
  a stream with its own size limit.
- Using the agent counts as DOCUMENTS_READ in delegation terms: it writes only
  its own tables, owned by the pair (actor, data owner), each conversation in
  its verified business. Domain tools that act on KeepInTax data keep the
  backend's own guards and services, and never pass a business without a
  number to a service (the expenses service then reads every business).
- `agent-harness.access.spec.ts` runs the real `FirebaseAuthGuard`: a revoked
  or missing delegation reaches no agent route.
- The agent must be built (`npm run build` in `backend/agent`) for these
  routes to answer; the production Dockerfile does not build it yet.

## Related topics

- [backend/agent](../../agent/AGENTS.md) — the agent package.
- [guards](../guards/AGENTS.md) — FirebaseAuthGuard.
