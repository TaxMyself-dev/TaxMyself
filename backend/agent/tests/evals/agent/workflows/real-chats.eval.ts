import { describe, it } from "@effect/vitest";
import { Schema } from "effect";

import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

import {
  evalConversationId,
  evalOpportunity,
  evalTask,
  evalWebSearch,
} from "../harness/agent-eval-fixtures";
import type { AgentEvalRow } from "../harness/agent-eval-fixtures";
import {
  runAgentConversation,
  runAgentHistory,
} from "../harness/agent-eval-harness";
import { calledToolNames } from "../harness/agent-eval-run-checks";

// Cases from real chats: mined and masked by
// tests/evals/traces/mine-agent-chats.ts, reviewed, and kept as the user
// wrote them. EXAMPLE cases, shaped as the product's own: replace them with
// your users' chats, each one a failure you saw and fixed.

// A web search that finds nothing, so a search the case does not want shows
// as a called tool.
const emptyWebSearch = evalWebSearch([]);

// Results found early, then a long talk about something else, then a
// question about one of the results. Its details are in the older part,
// which the model no longer reads whole (agentShortTermHistory); the agent
// searched again in the product's run before this case was fixed.
const northwindResult = {
  title: "Northwind Cafés: bookkeeper wanted for 3 locations",
  url: "https://example.com/requests/385",
  snippet:
    "Monthly books for 3 cafés, payroll for 40 staff. Needs 2 years of restaurant bookkeeping and QuickBooks.",
};

const earlierResultsChat: AgentChatMessage[] = [
  {
    id: "u1",
    role: "user",
    metadata: { createdAt: "2026-10-17T08:00:00.000Z" },
    parts: [
      { type: "text", text: "Search for restaurants looking for a bookkeeper" },
    ],
  },
  {
    id: "a1",
    role: "assistant",
    metadata: { createdAt: "2026-10-17T08:00:10.000Z" },
    parts: [
      // A dynamic part, as a stored call reads back without the tool's types.
      {
        type: "dynamic-tool",
        toolName: "searchWeb",
        toolCallId: "call_search",
        state: "output-available",
        input: { query: "restaurant looking for a bookkeeper", maxResults: 10 },
        output: [
          northwindResult,
          {
            title: "Taqueria needs part-time books",
            url: "https://example.com/requests/1",
            snippet: "One location, weekly receipts.",
          },
        ],
      },
      {
        type: "text",
        text: "I found 2 restaurants looking for a bookkeeper: Northwind Cafés and a taqueria.",
      },
    ],
  },
  // 20 exchanges about something else, each answer about 13,000 characters,
  // which pass the 48,000-token budget.
  ...Array.from({ length: 20 }, (_, index): AgentChatMessage[] => [
    {
      id: `u${index + 2}`,
      role: "user",
      metadata: {
        createdAt: `2026-10-17T09:${String(index).padStart(2, "0")}:00.000Z`,
      },
      parts: [
        {
          type: "text",
          text: `Tell me more about pricing my services, part ${index + 1}`,
        },
      ],
    },
    {
      id: `a${index + 2}`,
      role: "assistant",
      metadata: {
        createdAt: `2026-10-17T09:${String(index).padStart(2, "0")}:30.000Z`,
      },
      parts: [
        {
          type: "text",
          text: `Part ${index + 1} on pricing: `.concat(
            "Small businesses compare monthly packages more than hourly rates, and most pay for a fixed scope. ".repeat(
              130
            )
          ),
        },
      ],
    },
  ]).flat(),
  {
    id: "u-last",
    role: "user",
    metadata: { createdAt: "2026-10-17T10:00:00.000Z" },
    parts: [
      {
        type: "text",
        text: "Wait, what did Northwind Cafés ask for? And give me the link",
      },
    ],
  },
];

// The chat as saved, for searchEarlierResults.
const earlierResultsRows: AgentEvalRow[] = earlierResultsChat.map(
  (message) => ({
    conversation_id: evalConversationId,
    role: message.role,
    parts: Schema.decodeUnknownSync(Schema.Json)(message.parts),
    created_at: message.metadata?.createdAt ?? "",
  })
);

describe.concurrent("real chats", () => {
  it("answers about a result found early in a long chat from what it found, without searching again", async ({
    expect,
  }) => {
    const run = await runAgentHistory(
      {
        webSearch: emptyWebSearch,
        data: { agent_chat_messages: earlierResultsRows },
      },
      earlierResultsChat
    );

    const tools = calledToolNames(run);
    // Step: the earlier results were searched.
    expect(tools).toContain("searchEarlierResults");
    // Step: the web was not searched again.
    expect(tools).not.toContain("searchWeb");
    // Step: the answer gives what was asked for and its link.
    expect(run.output).toContain(northwindResult.url);
    expect(run.output).toMatch(/QuickBooks|2 years|two years/iu);
  });

  it("answers from the user's own opportunities when they ask about what was found", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      {
        tasks: [evalTask()],
        opportunities: [evalOpportunity()],
        webSearch: emptyWebSearch,
      },
      ["Any new leads from my tasks? Don't search the web"]
    );

    const tools = calledToolNames(run);
    // Step: the opportunities were read.
    expect(tools).toContain("listTaskOpportunities");
    // Step: the web was not searched.
    expect(tools).not.toContain("searchWeb");
  });
});
