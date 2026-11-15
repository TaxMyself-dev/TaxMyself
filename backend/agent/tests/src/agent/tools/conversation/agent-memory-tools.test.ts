import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { noAgentChatPageData } from "../../../../../src/agent/core/tool-runtime/agent-chat-page-data-port";
import type { AgentToolContext } from "../../../../../src/agent/core/tool-runtime/agent-tool-context";
import { agentToolCallKey } from "../../../../../src/agent/core/tool-runtime/agent-tool-idempotency";
import {
  forgetAgentMemoriesTool,
  saveAgentMemoryTool,
  updateAgentMemoryTool,
} from "../../../../../src/agent/tools/conversation/agent-memory-tools";
import { unusedEvalBooks } from "../../../../evals/agent/harness/agent-eval-books";
import type { AgentEvalWrite } from "../../../../evals/agent/harness/agent-eval-fixtures";
import {
  createAgentEvalSession,
  createEvalOpportunityStore,
  createEvalTaskStore,
} from "../../../../evals/agent/harness/agent-eval-scenario";
import { emptyEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

// KeepInTax (Phase 3.1): memory writes are idempotent by tool call (plan
// §2.7 item 6), and a business fact is held as kind business_fact until the
// business profile exists (A12).

const conversationId = "6f1c2a1e-4444-4a1a-8a1a-444444444444";

const memoryContext = () => {
  const writes: AgentEvalWrite[] = [];
  const supabase = createAgentEvalSession({}, writes);

  // The tool context as the agent builds it; only the database and the
  // conversation are used by the memory tools.
  const context: AgentToolContext = {
    conversationId,
    userId: "6f1c2a1e-6666-4a1a-8a1a-666666666666",
    supabase,
    settings: emptyEvalSettings,
    tasks: createEvalTaskStore([], writes),
    opportunities: createEvalOpportunityStore([], writes),
    webSearch: { search: () => Effect.die(new Error("unused")) },
    email: { send: () => Effect.die(new Error("unused")) },
    books: unusedEvalBooks(() => Effect.die(new Error("unused"))),
    pageData: noAgentChatPageData,
  };

  return { writes, supabase, context };
};

const stored = async (supabase: ReturnType<typeof createAgentEvalSession>) => {
  const { data } = await supabase.from("agent_memories").select("id, content");

  return data ?? [];
};

const decodeSavedMemory = Schema.decodeUnknownSync(
  Schema.Struct({ id: Schema.String, kind: Schema.String })
);

describe("agent memory tools", () => {
  it("the idempotency key is stable per call and differs between calls and conversations", () => {
    const key = agentToolCallKey(conversationId, "call_1");

    assert.strictEqual(key, agentToolCallKey(conversationId, "call_1"));
    assert.notStrictEqual(key, agentToolCallKey(conversationId, "call_2"));
    assert.notStrictEqual(
      key,
      agentToolCallKey("6f1c2a1e-5555-4a1a-8a1a-555555555555", "call_1")
    );
    assert.match(
      key,
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u
    );
  });

  it("the same call saved twice (a retried or resumed answer) saves one memory", async () => {
    const { supabase, context } = memoryContext();
    const options = { toolCallId: "call_1", messages: [], context };

    const first = await saveAgentMemoryTool.execute?.(
      { content: "מעדיף פירוט חודשי" },
      options
    );

    const again = await saveAgentMemoryTool.execute?.(
      { content: "מעדיף פירוט חודשי" },
      options
    );

    assert.deepStrictEqual(again, first);
    assert.lengthOf(await stored(supabase), 1);

    await saveAgentMemoryTool.execute?.(
      { content: "עובד מהבית" },
      { ...options, toolCallId: "call_2" }
    );
    assert.lengthOf(await stored(supabase), 2);
  });

  it("a business fact is kept as one, and an update keeps its kind", async () => {
    const { supabase, context } = memoryContext();

    const saved = decodeSavedMemory(
      await saveAgentMemoryTool.execute?.(
        { content: "עובד מהבית מתחילת השנה", kind: "business_fact" },
        { toolCallId: "call_1", messages: [], context }
      )
    );

    assert.strictEqual(saved.kind, "business_fact");
    const [first] = await stored(supabase);
    assert.strictEqual(
      first?.content,
      "[business_fact] עובד מהבית מתחילת השנה"
    );

    const updated = decodeSavedMemory(
      await updateAgentMemoryTool.execute?.(
        { memoryId: saved.id, content: "עובד מהבית מאז מרץ" },
        { toolCallId: "call_2", messages: [], context }
      )
    );

    assert.strictEqual(updated.kind, "business_fact");
    const [rewritten] = await stored(supabase);
    assert.strictEqual(
      rewritten?.content,
      "[business_fact] עובד מהבית מאז מרץ"
    );

    const forgotten = await forgetAgentMemoriesTool.execute?.(
      { memoryIds: [saved.id] },
      { toolCallId: "call_3", messages: [], context }
    );

    assert.deepStrictEqual(forgotten, { forgotten: 1 });
    assert.lengthOf(await stored(supabase), 0);
  });
});
