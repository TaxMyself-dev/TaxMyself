import { AsyncLocalStorage } from "node:async_hooks";

import type { AgentRequestUser } from "@/server/runtime/agent-request-identity";

// The request being served and the user the Nest backend verified for it,
// for the code that runs it (runAppRequest, the server functions), as
// TanStack Start's request context carried the request's cookies for the
// template. The agent's HTTP entry (agent-http.server.ts) runs each request
// inside it; work the request starts (a streamed answer, its saving) keeps
// it, since AsyncLocalStorage follows promises.

const agentRequestContext = new AsyncLocalStorage<{
  readonly request: Request;
  readonly user: AgentRequestUser;
}>();

/**
 * Runs work as the given request's.
 *
 * @param request - The request.
 * @param user - The user the Nest backend verified for it.
 * @param work - What serves it.
 * @returns What work returns.
 */
export const runInAgentRequest = <A>(
  request: Request,
  user: AgentRequestUser,
  work: () => A
) => agentRequestContext.run({ request, user }, work);

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
