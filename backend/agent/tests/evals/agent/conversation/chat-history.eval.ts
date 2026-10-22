import { describe, it } from "@effect/vitest";

import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

import { evalTask } from "../harness/agent-eval-fixtures";
import { runAgentHistory } from "../harness/agent-eval-harness";
import { taskDeleteNotReportedJudge } from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  calledToolNames,
  runDeletedNothing,
} from "../harness/agent-eval-run-checks";

// The conversation as the chat endpoint replays it (agentChatModelHistory):
// a call cut off by the stop button, an approval left unanswered, and the
// time each message was written.

const accountantTask = evalTask({
  sentence: "למצוא רואה חשבון לדוח הרבעוני",
});

const userMessage = (
  id: string,
  text: string,
  createdAt: string
): AgentChatMessage => ({
  id,
  role: "user",
  metadata: { createdAt },
  parts: [{ type: "text", text }],
});

describe.concurrent("chat history", () => {
  it("carries on after the user stopped a tool call", async ({ expect }) => {
    const run = await runAgentHistory(
      { locale: "he", tasks: [accountantTask] },
      [
        userMessage("u1", "מה המשימות שלי?", "2026-10-04T09:00:00.000Z"),
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-listTrackingTasks",
              toolCallId: "call_1",
              state: "input-available",
              input: {},
            },
          ],
        },
        userMessage(
          "u2",
          "עצרתי אותך. אז מה המשימות שלי?",
          "2026-10-04T09:01:00.000Z"
        ),
      ]
    );

    expect(calledToolNames(run)).toContain("listTrackingTasks");
    expect(run.output).toContain("רואה החשבון");
  });

  it("never runs an approval the user left unanswered", async ({ expect }) => {
    const run = await runAgentHistory(
      { locale: "he", tasks: [accountantTask] },
      [
        userMessage(
          "u1",
          "תמחק את המשימה של רואה החשבון",
          "2026-10-04T09:00:00.000Z"
        ),
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-deleteTrackingTasks",
              toolCallId: "call_1",
              state: "approval-requested",
              input: { taskIds: [accountantTask.id] },
              approval: { id: "approval_1" },
            },
          ],
        },
        userMessage(
          "u2",
          "לא משנה, תראה לי את המשימות",
          "2026-10-04T09:02:00.000Z"
        ),
      ]
    );

    expect(runDeletedNothing(run)).toBe(true);
    await expect(agentEvalTestCase(run)).toPass([taskDeleteNotReportedJudge()]);
  });

  // "What time is it?" alone is outside the agent's scope (<scope>), so the
  // case asks about the user's task: created at 08:01 UTC, and the message
  // was written at 09:01 UTC, an hour later.
  it("knows the time from the user's latest message", async ({ expect }) => {
    const run = await runAgentHistory(
      {
        locale: "he",
        tasks: [{ ...accountantTask, createdAt: "2026-10-04T08:01:00.000Z" }],
      },
      [
        userMessage(
          "u1",
          "כמה זמן עבר מאז שיצרתי את המשימה של רואה החשבון?",
          "2026-10-04T09:01:00.000Z"
        ),
      ]
    );

    expect(run.output).toMatch(/שעה|60 דקות/u);
  });
});
