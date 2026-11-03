import { AsyncLocalStorage } from "node:async_hooks";

import type { AgentDomain } from "@/server/runtime/agent-domain";
import type { AgentRequestUser } from "@/server/runtime/agent-request-identity";

// The request being served, the user the Nest backend verified for it and
// KeepInTax's domain bound to that user, for the code that runs it
// (runAppRequest, the server functions, the tools' ports), as TanStack
// Start's request context carried the request's cookies for the template.
// The agent's HTTP entry (agent-http.server.ts) runs each request inside it;
// work the request starts (a streamed answer, its saving) keeps it, since
// AsyncLocalStorage follows promises.

const agentRequestContext = new AsyncLocalStorage<{
  readonly request: Request;
  readonly user: AgentRequestUser;
  readonly domain: AgentDomain | undefined;
}>();

/**
 * Runs work as the given request's.
 *
 * @param request - The request.
 * @param user - The user the Nest backend verified for it.
 * @param work - What serves it.
 * @param domain - KeepInTax's domain for that user; none outside the Nest
 * backend (the tests, the task worker).
 * @returns What work returns.
 */
export const runInAgentRequest = <A>(
  request: Request,
  user: AgentRequestUser,
  work: () => A,
  domain?: AgentDomain
) => agentRequestContext.run({ request, user, domain }, work);

/**
 * KeepInTax's domain for the request being served, when the Nest backend
 * gave one.
 *
 * @returns The domain, or undefined.
 */
export const currentAgentDomain = () => agentRequestContext.getStore()?.domain;

/**
 * The verified user of the request being served.
 *
 * @returns The user.
 */
export const currentAgentRequestUser = () => {
  const context = agentRequestContext.getStore();

  if (context === undefined) {
    throw new Error(
      "AGENT_REQUEST_CONTEXT_MISSING: run the request through handleAgentHttpRequest"
    );
  }

  return context.user;
};
