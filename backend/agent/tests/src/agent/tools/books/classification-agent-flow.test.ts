import { MockLanguageModelV4 } from "ai/test";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createAppAgent } from "@/agent/core/agent/app-agent";

import { evalBooks } from "../../../../evals/agent/harness/agent-eval-books";
import { createAgentEvalDatabase } from "../../../../evals/agent/harness/agent-eval-database";
import {
  evalConversationId,
  evalUserId,
} from "../../../../evals/agent/harness/agent-eval-fixtures";
import {
  createEvalTaskStore,
  createEvalOpportunityStore,
} from "../../../../evals/agent/harness/agent-eval-scenario";
import { emptyEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe("classification flow through the real agent and approval boundary", () => {
  it.each(["classify", "preview", "steer", "restart"] as const)(
    "%s: enforces the right transition without executing a write",
    async (mode) => {
      let applied = 0;
      let calls = 0;
      let steered = false;
      const choices: string[] = [];
      const toolSets: string[][] = [];

      const model = new MockLanguageModelV4({
        doGenerate: async (options) => {
          calls += 1;
          choices.push(JSON.stringify(options.toolChoice));
          toolSets.push((options.tools ?? []).map((tool) => tool.name));

          if (calls === 1) {
            return await Promise.resolve({
              content: [
                {
                  type: "tool-call",
                  toolCallId: "prepare",
                  toolName: "prepareTransactionClassification",
                  input: JSON.stringify({
                    externalTransactionId: "tx",
                    subCategoryId: 7,
                    requestApproval: mode !== "preview",
                  }),
                },
              ],
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
              usage,
              warnings: [],
            });
          }

          // Reproduce the observed failure if the orchestration lets the model end
          // after preparation. The fixed path must demand the actual approval tool.
          if (options.toolChoice?.type === "required") {
            return await Promise.resolve({
              content: [
                {
                  type: "tool-call",
                  toolCallId: "classify",
                  toolName: "classifyTransaction",
                  input: JSON.stringify({ proposalId: "p" }),
                },
              ],
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
              usage,
              warnings: [],
            });
          }

          return await Promise.resolve({
            content: [
              {
                type: "text",
                text: {
                  classify: "אשרו בכרטיס כדי להחיל את הסיווג.",
                  preview: "הוכנה הצעה בלבד, ללא כרטיס אישור.",
                  steer: "הבקשה בוטלה; לא שונה דבר.",
                  restart: "הבקשה בוטלה; לא שונה דבר.",
                }[mode],
              },
            ],
            finishReason: { unified: "stop", raw: "stop" },
            usage,
            warnings: [],
          });
        },
      });

      const agent = createAppAgent({
        conversationId: evalConversationId,
        userId: evalUserId,
        model,
        supabase: createAgentEvalDatabase({}, []),
        settings: emptyEvalSettings,
        tasks: createEvalTaskStore([], []),
        opportunities: createEvalOpportunityStore([], []),
        webSearch: { search: () => Effect.die("unused") },
        email: { send: () => Effect.die("unused") },
        books: {
          ...evalBooks([]).books,
          prepareTransactionClassification: () =>
            Effect.succeed({
              proposal: JSON.stringify({
                signature: "p",
                payload: JSON.stringify({
                  display: { category: "משרד", subCategory: "תוכנה" },
                }),
              }),
            }),
          classifyTransaction: () =>
            Effect.sync(() => {
              applied += 1;

              return {
                status: "classified" as const,
                expenseApproved: false as const,
                category: "משרד",
                subCategory: "תוכנה",
              };
            }),
        },
        userSteers:
          mode === "steer" || mode === "restart"
            ? {
                take: async () => {
                  if (steered) {
                    return await Promise.resolve([]);
                  }

                  steered = true;

                  return await Promise.resolve([
                    {
                      role: "user" as const,
                      content: "בטל את הבקשה ואל תציג כרטיס אישור",
                    },
                  ]);
                },
              }
            : undefined,
      });

      let result = await agent.generate({
        messages: [
          {
            role: "user",
            content:
              mode === "preview"
                ? "הכן הצעת סיווג בלבד, בלי כרטיס אישור"
                : "סווג את תנועת Adobe שהצגת כהוצאות תוכנה",
          },
        ],
      });

      if (mode === "restart") {
        calls = 0;
        choices.length = 0;
        toolSets.length = 0;
        result = await agent.generate({
          messages: [
            {
              role: "user",
              content: "כעת סווג את תנועת Adobe לתוכנה והצג כרטיס אישור",
            },
          ],
        });
      }

      expect(choices[1] === JSON.stringify({ type: "required" })).toBe(
        mode === "classify" || mode === "restart"
      );
      expect(
        toolSets[1]?.length === 1 && toolSets[1][0] === "classifyTransaction"
      ).toBe(mode === "classify" || mode === "restart");
      expect(applied).toBe(0);

      const approvals = result.content.filter(
        (part) => part.type === "tool-approval-request"
      );

      expect(approvals).toHaveLength(
        mode === "classify" || mode === "restart" ? 1 : 0
      );
      expect(calls).toBe(2);
    }
  );
});
