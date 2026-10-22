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

## Invariants

- `main.ts` leaves `/api/agent/` bodies unparsed: the agent reads its body as
  a stream with its own size limit.
- Using the agent counts as DOCUMENTS_READ in delegation terms: it writes only
  its own tables, owned by the actor. Domain tools that act on KeepInTax data
  keep the backend's own guards and services.
- The agent must be built (`npm run build` in `backend/agent`) for these
  routes to answer; the production Dockerfile does not build it yet.

## Related topics

- [backend/agent](../../agent/AGENTS.md) — the agent package.
- [guards](../guards/AGENTS.md) — FirebaseAuthGuard.
