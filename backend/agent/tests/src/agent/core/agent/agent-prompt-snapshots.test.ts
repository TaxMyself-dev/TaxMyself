import { assert, it, describe } from "@effect/vitest";
import { asSchema, convertToModelMessages } from "ai";
import { Predicate } from "effect";

import { agentChatModelHistory } from "../../../../../src/agent/chat/messages/agent-chat-model-history";
import { agentInstructions } from "../../../../../src/agent/core/agent/agent-instructions";
import { agentUserContextText } from "../../../../../src/agent/core/agent/agent-user-context";
import { deferRareAgentTools } from "../../../../../src/agent/core/tool-runtime/agent-tool-search";
import { appAgentTools } from "../../../../../src/agent/core/tool-runtime/app-agent-tools";
import { agentShortTermHistory } from "../../../../../src/agent/memory/short-term-memory.server";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import { exampleEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

// What the model receives, kept as files beside this test so every change to
// the instructions, a tool's description or schema, or how the history is
// rewritten shows up in review (Codex, DeepSeek and Grok snapshot the same).
// After a deliberate change, update them with `vitest run -u` and read the
// diff.

const snapshot = (name: string) => `./__snapshots__/agent-prompt/${name}`;

const userMessage = (id: string, text: string): AgentChatMessage => ({
  id,
  role: "user",
  metadata: { createdAt: "2026-10-04T09:01:00.000Z" },
  parts: [{ type: "text", text }],
});

const modelHistory = async (messages: AgentChatMessage[]) =>
  JSON.stringify(
    await convertToModelMessages(agentChatModelHistory(messages)),
    null,
    2
  );

// A deletion the user denied, with the note the card's revise sent.
const deniedDeletion = (id: string, reason?: string): AgentChatMessage => ({
  id,
  role: "assistant",
  parts: [
    {
      type: "tool-deleteTrackingTasks",
      toolCallId: `call-${id}`,
      state: "output-denied",
      input: { taskIds: ["6f1c2a1e-1111-4a1a-8a1a-111111111111"] },
      approval: { id: `approval-${id}`, approved: false, reason },
    },
  ],
});

describe("agent prompt snapshots", () => {
  // The instructions are the cached start of every request: one text for
  // every user, whatever their settings and memories (those arrive as the
  // user context). Only the app's language changes them, for a whole chat.
  it("the instructions, the same for every user", async ({ expect }) => {
    await expect(agentInstructions("he")).toMatchFileSnapshot(
      snapshot("instructions.md")
    );
  });

  // What every request carries, measured as sent (the playbook's "measure
  // the prompt that is actually sent"): growth past these fails here
  // instead of slipping in. The owner's target (2026-10-16): 10,000-20,000
  // characters each for the instructions and for the tools sent up front,
  // about 15,000 ideally; the deferred ones load on demand. 2026-10-16:
  // 17,064 of instructions and 17,805 of up-front tools (from 31,554).
  // A cut that drops a section passes the snapshot once it is updated; this
  // names every section the instructions must keep (a rewrite once lost
  // <approvals> and a content-safety section that way).
  it("the instructions keep every section, each opened and closed", () => {
    const instructions = agentInstructions("he");

    for (const section of [
      "voice",
      "writing",
      "facts",
      "tool_calls",
      "tasks",
      "approvals",
      "outside_content",
      "scope",
      "missing_details",
      "follow_ups",
      "memory_rules",
    ]) {
      assert.include(instructions, `\n<${section}>\n`, section);
      assert.include(instructions, `\n</${section}>`, section);
    }
  });

  it("the instructions and the up-front tools stay within their budget", async () => {
    assert.isAtMost(agentInstructions("he").length, 20_000);

    const upFront = await Promise.all(
      Object.values(deferRareAgentTools(appAgentTools))
        .filter((tool) => tool.providerOptions?.openai === undefined)
        .map(
          async (tool) =>
            `${Predicate.isString(tool.description) ? tool.description : ""}${JSON.stringify(await asSchema(tool.inputSchema).jsonSchema)}`
        )
    );

    assert.isAtMost(upFront.join("").length, 20_000);
  });

  it("the user context for a broker with one memory", async ({ expect }) => {
    await expect(
      agentUserContextText(exampleEvalSettings, [
        {
          id: "6f1c2a1e-3333-4a1a-8a1a-333333333333",
          content: "Prefers short answers",
          createdAt: "2026-10-01T09:00:00.000Z",
          updatedAt: "2026-10-01T09:00:00.000Z",
        },
      ])
    ).toMatchFileSnapshot(snapshot("user-context.md"));
  });

  it("every tool's description, input schema and deferred namespace", async ({
    expect,
  }) => {
    const tools = await Promise.all(
      Object.entries(deferRareAgentTools(appAgentTools)).map(
        async ([name, tool]) => ({
          name,
          description: tool.description,
          // The namespace a rare tool loads with through tool search.
          openai: tool.providerOptions?.openai,
          inputSchema: await asSchema(tool.inputSchema).jsonSchema,
        })
      )
    );

    await expect(JSON.stringify(tools, null, 2)).toMatchFileSnapshot(
      snapshot("tools.json")
    );
  });

  it("the history after a denial and after a denial with a note", async ({
    expect,
  }) => {
    await expect(
      await modelHistory([
        userMessage("u1", "Delete the accountant task"),
        deniedDeletion("a1"),
        userMessage("u2", "Delete all the old tasks anyway"),
        deniedDeletion("a2", "Only the done ones"),
        userMessage("u3", "What is left?"),
      ])
    ).toMatchFileSnapshot(snapshot("history-after-denial.json"));
  });

  it("the history after the user stopped an answer mid-action", async ({
    expect,
  }) => {
    await expect(
      await modelHistory([
        userMessage("u1", "Create a task to call the accountant"),
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-createTrackingTask",
              toolCallId: "call-a1",
              state: "input-available",
              input: { sentence: "Find an accountant" },
            },
          ],
        },
        userMessage("u2", "I stopped you, what happened?"),
      ])
    ).toMatchFileSnapshot(snapshot("history-after-stop.json"));
  });

  it("the history of a long chat, its older part listed, with the playbook loaded in it", async ({
    expect,
  }) => {
    // Past the 48,000-token budget: 40 messages of 8,000 bytes (2,000
    // tokens), the first two asking about a task and loading a playbook.
    const filler = (index: number): AgentChatMessage =>
      index % 2 === 0
        ? userMessage(`u${index}`, `שאלה ${index} `.padEnd(8000, "ש"))
        : {
            id: `a${index}`,
            role: "assistant",
            parts: [
              { type: "text", text: `תשובה ${index} `.padEnd(4000, "ת") },
            ],
          };

    const messages: AgentChatMessage[] = [
      userMessage("u0", "Why is the accountant task still open?"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-loadAgentSkill",
            toolCallId: "call-a1",
            state: "output-available",
            input: { name: "research-brief" },
            output: { name: "research-brief", content: "" },
          },
        ],
      },
      ...Array.from({ length: 38 }, (_, index) => filler(index + 2)),
    ];

    const history = agentShortTermHistory(messages);

    // The list as the model reads it; the newest messages follow it as they
    // are.
    assert.isTrue(history[0].id.startsWith("earlier-"));
    await expect(await modelHistory(history.slice(0, 1))).toMatchFileSnapshot(
      snapshot("history-after-earlier-part.json")
    );
  });
});
