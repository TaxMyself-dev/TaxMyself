import type { UIMessageStreamWriter } from "ai";

import type { AgentChatPageData } from "@/agent/core/tool-runtime/agent-chat-page-data-port";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

type AgentChatStreamWriter = UIMessageStreamWriter<AgentChatMessage>;

/**
 * The chat endpoint's page data: it writes to the response stream once the
 * stream opens (connect); anything shown before that waits for it.
 *
 * @returns The page data, with connect for the stream.
 */
export const createAgentChatPageData = () => {
  let writer: AgentChatStreamWriter | null = null;
  const waiting: ((target: AgentChatStreamWriter) => void)[] = [];

  const send = (write: (target: AgentChatStreamWriter) => void) => {
    if (writer) {
      write(writer);
    } else {
      waiting.push(write);
    }
  };

  const pageData: AgentChatPageData = {
    showOpportunities: (opportunities) => {
      send((target) => {
        target.write({
          type: "data-opportunities",
          data: opportunities,
          transient: true,
        });
      });
    },
    showRetry: (attempt, of) => {
      send((target) => {
        target.write({
          type: "data-retry",
          data: { attempt, of },
          transient: true,
        });
      });
    },
    showSearchProgress: (progress) => {
      send((target) => {
        target.write({
          type: "data-searchProgress",
          data: progress,
          transient: true,
        });
      });
    },
  };

  const connect = (target: AgentChatStreamWriter) => {
    writer = target;

    for (const write of waiting.splice(0)) {
      write(target);
    }
  };

  return { pageData, connect };
};
