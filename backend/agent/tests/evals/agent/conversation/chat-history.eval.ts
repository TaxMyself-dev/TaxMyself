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
  // KeepInTax Phase 3.1 (KT-108): skipped, not passing. The template's tracking tasks, opportunities, web search, email and playbooks are no longer offered in chat. This case resumes a stopped listTrackingTasks call. The code stays for Phase 5.1's monitors over the books (plan §3.10, A16, A17).
  it.skip("carries on after the user stopped a tool call", async ({
    expect,
  }) => {
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
  // case asks about the user's earlier question in this chat: written at
  // 08:01 UTC, and the new message at 09:01 UTC, an hour later.
  // KeepInTax Phase 3.1 (KT-108): restated in KeepInTax's terms; the template's version asked about tracking tasks or finding clients, which are no longer offered in chat (A17). What the case guards is unchanged.
  it("knows the time from the user's latest message", async ({ expect }) => {
    const run = await runAgentHistory({ locale: "he" }, [
      userMessage("u1", "כמה הוצאתי על דלק השנה?", "2026-10-04T08:01:00.000Z"),
      {
        id: "a1",
        role: "assistant",
        metadata: { createdAt: "2026-10-04T08:01:30.000Z" },
        parts: [{ type: "text", text: "השנה הוצאתם 1,662 ₪ על דלק." }],
      },
      userMessage(
        "u2",
        "כמה זמן עבר מאז ששאלתי על הדלק?",
        "2026-10-04T09:01:00.000Z"
      ),
    ]);

    expect(run.output).toMatch(/שעה|60 דקות/u);
  });
});
