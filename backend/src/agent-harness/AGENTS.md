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
  `queryExpenses` reads through `ExpensesService`, for one business or
  several of the owner's with a combined total in agorot (semantics in
  `backend/agent/GUIDE.md`, "queryExpenses").

## Invariants

- `AgentBooksService` binds the nine additional Phase 3 read tools to the
  verified data owner and an owned numbered business. Access is checked
  before reading and again before returning; a revoked read returns no
  previously read result. It calls existing services without their writing
  preparation/generation paths. `queryExpenses` keeps its existing service
  and semantics. See `backend/agent/GUIDE.md` for source/amount contracts.

- `main.ts` leaves `/api/agent/` bodies unparsed: the agent reads its body as
  a stream with its own size limit.
- Entering chat counts as DOCUMENTS_READ in delegation terms. Conversation and
  memory data belong to the pair (actor, data owner); Phase A domain actions
  separately recheck current write scope and module access. A conversation may
  cover any of that owner's businesses. The agent names the business for
  each read (the one the user named or established in the conversation);
  `chooseBusiness` takes it, else the owner's only one, else
  BUSINESS_REQUIRED, and never falls back to the `businessnumber` header,
  which non-chat endpoints still use unchanged. `listBusinesses` gives the
  agent the owner's numbered businesses (backend/agent/GUIDE.md "Business
  selection"). Domain tools that act on KeepInTax data keep the
  backend's own guards and services, and never pass a business without a
  number to a service (the expenses service then reads every business).
- `agent-harness.access.spec.ts` runs the real `FirebaseAuthGuard`: a revoked
  or missing delegation reaches no agent route.
- The agent must be built (`npm run build` in `backend/agent`) for these
  routes to answer; the production Dockerfile does not build it yet.
  `backend/Dockerfile.agent-dev` builds both packages with Node 24 and includes
  the agent bundle and its runtime dependencies for the dev Cloud Run service.
  It defaults DISABLE_SYNCHRONIZE=true. See docs/operations/dev-ai-assistant.md.

## Related topics

- [backend/agent](../../agent/AGENTS.md) — the agent package.
- [guards](../guards/AGENTS.md) — FirebaseAuthGuard.

## Background error isolation

Agent import, requests and disposal run in agent-background-context.ts's
AsyncLocalStorage scope. The rejection guard recognizes that async origin
even for AggregateError with only node:net frames; it retains the legacy
agent-stack fallback and rethrows unrelated backend rejections. Do not
replace this boundary with a global catch-all. Child-process regression
tests prove both survival of the reported shape and unrelated-error failure.

## Phase A classification action

`AgentClassificationService` adds the two classification ports to the request
domain. Reads remain in AgentBooksService; writes never inherit its read scope.
Every prepare/apply rechecks access and OPEN_BANKING; delegated actors need a
current ACTIVE delegation with EXPENSES_APPROVE. The action is only a one-time
classification of an owned business's outgoing pending transaction. Signed,
expiring proposals bind actor/owner, display, catalog values and source state.
The agent tool resolves them from the owned chat before invoking the domain.
Apply uses TransactionProcessingService.classifyPendingForAgent; there is no
direct controller write endpoint, expense approval or rule-creation path.
