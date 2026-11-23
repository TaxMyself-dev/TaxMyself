import { constVoid } from "effect/Function";

import type { AgentChatSearchProgress } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { TaskOpportunity } from "@/lib/opportunities/task-opportunity-schema";

// The port the agent's tools show things on the chat page through. It lives
// in the core so the agent and its tools need nothing from the chat
// transport; the chat endpoint implements it (createAgentChatPageData).

/**
 * What the agent shows on the chat page beyond its answer: the full
 * opportunities a listing read, so their cards render at once instead of
 * reading them again by id, each retry of a failed model call (retryAgentModelVisibly) and a slow search's progress
 * (searchProgress). They travel as transient stream parts: the page shows
 * them and the stored answer does not keep them, so stored messages stay
 * small. Add one method per kind of live data your tools show (a list of
 * records to seed the page's cache, a long job's progress). Agent evals
 * have no page and pass noAgentChatPageData.
 */
export interface AgentChatPageData {
  showOpportunities: (opportunities: TaskOpportunity[]) => void;
  showRetry: (attempt: number, of: number) => void;
  showSearchProgress: (progress: AgentChatSearchProgress) => void;
}

export const noAgentChatPageData: AgentChatPageData = {
  showOpportunities: constVoid,
  showRetry: constVoid,
  showSearchProgress: constVoid,
};
