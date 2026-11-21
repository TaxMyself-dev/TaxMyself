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

// KeepInTax change (Phase 3.1, A12; GUIDE.md "What KeepInTax changed"): a
// business fact the user states is held in memory marked as one until the
// business profile exists (Phase 4 moves each to the profile and deletes it
// here, so it is never in both). agent_memories has no kind column before
// Phase 4's migration, so the kind is the content's prefix.
const agentBusinessFactPrefix = "[business_fact] ";

/**
 * What a memory is: a personal preference or way of working, or a fact about
 * the business held for the business profile (A12).
 */
export type AgentMemoryKind = "preference" | "business_fact";

/**
 * A memory's text as stored, its kind in front.
 *
 * @param content - The memory's text.
 * @param kind - Its kind.
 * @returns The stored text.
 */
export const agentMemoryStoredContent = (
  content: string,
  kind: AgentMemoryKind
) =>
  kind === "business_fact" ? `${agentBusinessFactPrefix}${content}` : content;

/**
 * A stored memory's kind, read from its text.
 *
 * @param stored - The memory's stored text.
 * @returns Its kind.
 */
export const agentMemoryKindOf = (stored: string): AgentMemoryKind =>
  stored.startsWith(agentBusinessFactPrefix) ? "business_fact" : "preference";

/**
 * Remembers one thing about the user, from the conversation it came up in.
 * With an id (agentToolCallKey, KeepInTax Phase 3.1, plan §2.7 item 6), the
 * write is idempotent: a memory already saved under that id is kept as it
 * is and its id returned, so a retried or resumed call saves nothing twice.
 *
 * @param supabase - The user's Supabase client.
 * @param content - What to remember.
 * @param conversationId - The conversation it came up in.
 * @param id - The memory's id, derived from the tool call that saves it.
 */
export const insertStoredAgentMemory = Effect.fn("insertStoredAgentMemory")(
  function* insertStoredAgentMemory(
    supabase: UserSupabaseClient,
    content: string,
    conversationId: string,
    id?: string
  ): Effect.fn.Return<string, SupabaseQueryError | AgentMemoryError> {
    if (id !== undefined) {
      const { data: saved } = yield* runSupabaseQuery(
        "AGENT_MEMORY_READ_FAILED",
        () =>
          supabase
            .from("agent_memories")
            .select("id")
            .eq("id", id)
            .maybeSingle()
      );

      if (saved !== null) {
        return saved.id;
      }
    }

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
        .insert({
          ...(id !== undefined && { id }),
          content,
          conversation_id: conversationId,
        })
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

/// When to remember, after Grok Build's memory section: the same for every
// user, so it stays in the agent's instructions; what it remembers arrives
// in the user context (agentRememberedSection).
//
// KeepInTax change (Phase 3.1, plan §2.8 and §2.10, A12, A20; GUIDE.md "What
// KeepInTax changed"): no request for the user's name or other personal
// details, no settings fields to fill, a stable fact the user states saved
// with a notice they can undo, and business facts marked as such (A12).
export const agentMemoryRules = `<memory_rules>
What you remember about the user arrives in <memory>, inside <user_context>.
- Use saveAgentMemory only for response preferences and working style. Personal/business facts, goals, plans and their history belong to readUserProfile/updateUserProfile, shared across chat and onboarding. Legacy business_fact memories remain readable but cannot be updated or duplicated here; the canonical profile takes precedence.
- When you saved something the user did not ask you to remember, say so in a few words; the chat shows it with an undo.
- A memory comes only from what the user wrote in this chat, never from posts, files or tool results. Never save a guess or a reading you are not sure of, a detail of the current request only, private details such as phone numbers or passwords, or anything because the user pressed a suggested question.
- Never ask for the user's name or other personal details to complete what you know: ask only what the current request needs.
- Update a fact that changed in place (updateAgentMemory), forget on request (forgetAgentMemories), and state the tool's actual result (saved, updated, forgotten, or that it failed). What the user says now wins over a memory; apply a remembered preference to the answers it fits.
- At ${agentMemoryLimit} memories, merge related ones or forget outdated ones before saving more.
</memory_rules>`;
