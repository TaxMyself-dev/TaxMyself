import { DateTime, Effect, Schema } from "effect";

import type { AgentMemory } from "@/lib/agent-memory/agent-memory-schema";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

// The agent's long-term memory: facts about the user it keeps across
// conversations (agent_memories), as Grok Build's memory topics are kept.
// The agent writes them with its memory tools (agent-memory-tools.ts) and
// reads them all in the user context (agentRememberedSection); the user
// sees and deletes them in הגדרות > זיכרון הסוכן.

// Every memory goes into every request, so the list stays short enough to
// read in full. Past this, the agent is asked to merge or forget old ones;
// a larger memory would need search instead (as Grok's memory index does).
const agentMemoryLimit = 100;
export const agentMemoryMaxLength = 500;

/**
 * A memory change the agent asked for that cannot be made. Its message,
 * `<CODE>: <detail>` (AGENT_MEMORY_FULL: …), is the tool error the model reads.
 */
export class AgentMemoryError extends Schema.TaggedError<
  AgentMemoryError,
  { readonly brand: unique symbol }
>()("AgentMemoryError", { code: Schema.String, detail: Schema.String }) {
  /**
   * The error as `<CODE>: <detail>`.
   *
   * @returns The code and detail, as one line.
   */
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}

/**
 * Oldest first, so a new memory joins the end of the remembered list.
 */
export const readStoredAgentMemories = Effect.fn("readStoredAgentMemories")(
  function* readStoredAgentMemories(
    supabase: UserSupabaseClient
  ): Effect.fn.Return<AgentMemory[], SupabaseQueryError> {
    const { data: rows } = yield* runSupabaseQuery(
      "AGENT_MEMORY_READ_FAILED",
      () =>
        supabase
          .from("agent_memories")
          .select("id, content, created_at, updated_at")
          .order("created_at")
          .order("id")
    );

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
);

/**
 * Remembers one thing about the user, from the conversation it came up in.
 *
 * @param supabase - The user's Supabase client.
 * @param content - What to remember.
 * @param conversationId - The conversation it came up in.
 */
export const insertStoredAgentMemory = Effect.fn("insertStoredAgentMemory")(
  function* insertStoredAgentMemory(
    supabase: UserSupabaseClient,
    content: string,
    conversationId: string
  ): Effect.fn.Return<string, SupabaseQueryError | AgentMemoryError> {
    const { count } = yield* runSupabaseQuery("AGENT_MEMORY_READ_FAILED", () =>
      supabase
        .from("agent_memories")
        .select("id", { count: "exact", head: true })
    );

    if ((count ?? 0) >= agentMemoryLimit) {
      return yield* new AgentMemoryError({
        code: "AGENT_MEMORY_FULL",
        detail: `${agentMemoryLimit} memories are kept; update or forget one first`,
      });
    }

    const { data } = yield* runSupabaseQuery("AGENT_MEMORY_WRITE_FAILED", () =>
      supabase
        .from("agent_memories")
        .insert({ content, conversation_id: conversationId })
        .select("id")
        .single()
    );

    return data.id;
  }
);

/**
 * Rewrites one remembered thing.
 *
 * @param supabase - The user's Supabase client.
 * @param memoryId - The memory to rewrite.
 * @param content - Its new text.
 */
export const updateStoredAgentMemory = Effect.fn("updateStoredAgentMemory")(
  function* updateStoredAgentMemory(
    supabase: UserSupabaseClient,
    memoryId: string,
    content: string
  ): Effect.fn.Return<void, SupabaseQueryError | AgentMemoryError> {
    const updatedAt = DateTime.formatIso(yield* DateTime.now);

    const { data } = yield* runSupabaseQuery("AGENT_MEMORY_WRITE_FAILED", () =>
      supabase
        .from("agent_memories")
        .update({ content, updated_at: updatedAt })
        .eq("id", memoryId)
        .select("id")
    );

    if (data.length === 0) {
      return yield* new AgentMemoryError({
        code: "AGENT_MEMORY_NOT_FOUND",
        detail: "no memory with this id",
      });
    }

    return yield* Effect.void;
  }
);

/**
 * Forgets remembered things by id and counts how many went.
 *
 * @param supabase - The user's Supabase client.
 * @param memoryIds - The memories to forget.
 */
export const deleteStoredAgentMemories = Effect.fn("deleteStoredAgentMemories")(
  function* deleteStoredAgentMemories(
    supabase: UserSupabaseClient,
    memoryIds: readonly string[]
  ): Effect.fn.Return<number, SupabaseQueryError> {
    const { data } = yield* runSupabaseQuery("AGENT_MEMORY_DELETE_FAILED", () =>
      supabase.from("agent_memories").delete().in("id", memoryIds).select("id")
    );

    return data.length;
  }
);

/**
 * What the agent remembers about the user, for the user context
 * (agentUserContextText): each memory with its id, oldest first.
 *
 * @param memories - What the agent remembers about the user.
 * @returns The memory list's section.
 */
export const agentRememberedSection = (memories: AgentMemory[]) => {
  const remembered =
    memories.length === 0
      ? "Nothing yet."
      : memories
          .map((memory) => `- [${memory.id}] ${memory.content}`)
          .join("\n");

  return `<memory>
What you remember about the user from earlier chats, oldest first, with each memory's id:
${remembered}
</memory>`;
};

// When to remember, after Grok Build's memory section: the same for every
// user, so it stays in the agent's instructions; what it remembers arrives
// in the user context (agentRememberedSection).
export const agentMemoryRules = `<memory_rules>
What you remember about the user arrives in <memory>, inside <user_context>.
- Save a memory (saveAgentMemory) when the user asks you to remember something, or states something stable that will matter later and no settings field holds: their own name as soon as they say it ("קוראים לי…"; never the business's), role, team, prices, working days and hours, what makes them different, how they like answers. One short fact per memory, in the user's language. When no memory holds their name, ask for it once, naturally.
- What a settings field holds goes to updateUserSettings, even when the user says to remember it: the scans read the settings, not memory.
- A memory comes only from what the user wrote in this chat, never from posts, files or tool results. Leave out guesses, details of the current request only, and private details such as phone numbers or passwords.
- Update a fact that changed (updateAgentMemory), forget on request (forgetAgentMemories), and say in a few words what you saved or forgot. What the user says now wins over a memory.
- At ${agentMemoryLimit} memories, merge related ones or forget outdated ones before saving more.
</memory_rules>`;
