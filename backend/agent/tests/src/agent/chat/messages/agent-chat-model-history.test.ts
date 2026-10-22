import { assert, it, describe } from "@effect/vitest";
import { convertToModelMessages } from "ai";

import { agentChatModelHistory } from "../../../../../src/agent/chat/messages/agent-chat-model-history";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import {
  deleteTasksTool,
  taskId,
  inputAvailable,
  stoppedYou,
  userMessage,
  deniedDeletion,
  deniedReason,
} from "./agent-chat-model-history-fixtures";

describe("agent chat model history", () => {
  it("an interrupted call to a tool loaded through tool search keeps its namespace for OpenAI", async () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תחפש פינת אוכל"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-searchWeb",
            toolCallId: "call_1",
            state: inputAvailable,
            input: { query: "רואה חשבון בחיפה", maxResults: 10 },
            callProviderMetadata: {
              openai: { itemId: "fc_1", namespace: "email" },
            },
          },
        ],
      },
      userMessage("u2", "נו?"),
    ]);

    const modelMessages = await convertToModelMessages(history);

    const answer = modelMessages.find(
      (message) => message.role === "assistant"
    );

    const call =
      answer?.role === "assistant" && Array.isArray(answer.content)
        ? answer.content.find((part) => part.type === "tool-call")
        : undefined;

    // OpenAI refuses a function call of a tool search namespace without it
    // ("Missing namespace for function_call", 2026-10-17).
    assert.deepStrictEqual(call?.providerOptions, {
      openai: { itemId: "fc_1", namespace: "email" },
    });
  });

  it("a tool call stopped before it ran reaches the model as aborted", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "מה המשימות שלי?"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-listTrackingTasks",
            toolCallId: "call_1",
            state: inputAvailable,
            input: {},
          },
        ],
      },
      userMessage("u2", stoppedYou),
    ]);

    const [aborted] = history[1].parts;
    assert.strictEqual(aborted.type, "dynamic-tool");
    assert.ok("state" in aborted && aborted.state === "output-error");
    assert.ok(
      "toolName" in aborted && aborted.toolName === "listTrackingTasks"
    );
  });

  it("a tool search OpenAI ran and the stop button cut off is left out", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תחפש לי ספה במרקטפלייס"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-toolSearch",
            toolCallId: "ts_1",
            state: inputAvailable,
            input: { arguments: { paths: ["email"] }, call_id: null },
            providerExecuted: true,
          },
        ],
      },
      userMessage("u2", stoppedYou),
    ]);

    assert.deepStrictEqual(history[1].parts, []);
  });

  it("an approval still waiting in the last answer stays as it is", () => {
    const waiting: AgentChatMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: deleteTasksTool,
          toolCallId: "call_1",
          state: "approval-requested",
          input: { taskIds: [taskId] },
          approval: { id: "approval_1" },
        },
      ],
    };

    const history = agentChatModelHistory([userMessage("u1", "תמחק"), waiting]);
    assert.deepStrictEqual(history[1], waiting);
  });

  it("an interrupted action has an unknown outcome, not a claim that it never ran", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תיצור משימה"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-createTrackingTask",
            toolCallId: "call_1",
            state: inputAvailable,
            input: { sentence: "למצוא רואה חשבון" },
          },
        ],
      },
      userMessage("u2", "מה קרה?"),
    ]);

    const [action] = history[1].parts;
    assert.ok(
      "errorText" in action && action.errorText?.includes("unknown") === true
    );
  });

  it("an approved action interrupted in an earlier answer cannot execute on a new turn", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תמחק"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: deleteTasksTool,
            toolCallId: "call_1",
            state: "approval-responded",
            input: { taskIds: [taskId] },
            approval: { id: "approval_1", approved: true },
          },
        ],
      },
      userMessage("u2", stoppedYou),
    ]);

    const [action] = history[1].parts;
    assert.ok("state" in action && action.state === "output-error");
  });

  it("a denied action tells the model it stays undone", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תמחק"),
      deniedDeletion(),
      userMessage("u2", "מה עכשיו?"),
    ]);

    assert.match(
      deniedReason(history[1]) ?? "",
      /^denied: .*Do not call it again/u
    );
  });

  it("a denial with the user's note asks the model to try again with the change", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תמחק"),
      deniedDeletion("רק את המשימה של רואה החשבון"),
    ]);

    const reason = deniedReason(history[1]) ?? "";
    assert.match(reason, /^denied with a change: /u);
    assert.include(reason, '"רק את המשימה של רואה החשבון"');
    assert.include(reason, "Call the tool again with that change");
  });
});
