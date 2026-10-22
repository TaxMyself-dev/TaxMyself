import { DateTime, Effect } from "effect";

import {
  readAgentChatMessageRows,
  readStoredAgentChatRows,
} from "@/agent/chat/messages/agent-chat-message-storage.server";
import type { AgentChatMessageInvalidError } from "@/agent/chat/messages/agent-chat-message-storage.server";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

/**
 * One of the agent's conversations as the chat list shows it
 * (list_agent_chat_conversations): its name, pin and creation, the start of
 * its first user message (its title until it is named), and whether it has
 * messages. Its messages load when it opens
 * (readStoredAgentChatConversationMessages): the list used to carry them all,
 * so the chat page's HTML held every conversation (872 KB for the e2e tester,
 * 2026-10-17) and every app page downloaded them.
 */
export interface StoredAgentChatConversation {
  id: string;
  name: string | null;
  pinned: boolean;
  createdAt: string;
  firstText: string | null;
  hasMessages: boolean;
}

/**
 * The signed-in user's conversations, newest first (at most 200), without
 * their messages; listAgentChatConversations checks the owner first.
 */
export const readStoredAgentChatConversations = Effect.fn(
  "readStoredAgentChatConversations"
)(function* readStoredAgentChatConversations(
  supabase: UserSupabaseClient
): Effect.fn.Return<StoredAgentChatConversation[], SupabaseQueryError> {
  const { data: rows } = yield* runSupabaseQuery("AGENT_CHAT_READ_FAILED", () =>
    supabase.rpc("list_agent_chat_conversations")
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    pinned: row.pinned,
    createdAt: row.created_at,
    firstText: row.first_text,
    hasMessages: row.has_messages,
  }));
});

/**
 * One of the user's conversations' messages, in order, validated against
 * the agent's tools; none for a conversation RLS does not show them.
 */
export const readStoredAgentChatConversationMessages = Effect.fn(
  "readStoredAgentChatConversationMessages"
)(function* readStoredAgentChatConversationMessages(
  supabase: UserSupabaseClient,
  conversationId: string
): Effect.fn.Return<
  AgentChatMessage[],
  SupabaseQueryError | AgentChatMessageInvalidError
> {
  return yield* readAgentChatMessageRows(
    yield* readStoredAgentChatRows(supabase, [conversationId])
  );
});

/**
 * The user's conversations whose messages' texts contain the words, for the
 * chat search (search_agent_chat_conversations).
 */
export const searchStoredAgentChatConversations = Effect.fn(
  "searchStoredAgentChatConversations"
)(function* searchStoredAgentChatConversations(
  supabase: UserSupabaseClient,
  words: string
): Effect.fn.Return<string[], SupabaseQueryError> {
  const { data: rows } = yield* runSupabaseQuery("AGENT_CHAT_READ_FAILED", () =>
    supabase.rpc("search_agent_chat_conversations", { words })
  );

  return rows.map((row) => row.conversation_id);
});

/**
 * Renames or pins one of the user's conversations; RLS limits it to theirs.
 */
export const updateAgentChatConversationRow = Effect.fn(
  "updateAgentChatConversationRow"
)(function* updateAgentChatConversationRow(
  supabase: UserSupabaseClient,
  conversationId: string,
  change: { name?: string; pinned?: boolean }
): Effect.fn.Return<void, SupabaseQueryError> {
  const updatedAt = DateTime.formatIso(yield* DateTime.now);
  yield* runSupabaseQuery("AGENT_CHAT_WRITE_FAILED", () =>
    supabase
      .from("agent_chat_conversations")
      .update({ ...change, updated_at: updatedAt })
      .eq("id", conversationId)
  );
});

/**
 * Deletes one of the user's conversations with its messages.
 */
export const deleteAgentChatConversationRow = Effect.fn(
  "deleteAgentChatConversationRow"
)(function* deleteAgentChatConversationRow(
  supabase: UserSupabaseClient,
  conversationId: string
): Effect.fn.Return<void, SupabaseQueryError> {
  yield* runSupabaseQuery("AGENT_CHAT_DELETE_FAILED", () =>
    supabase.from("agent_chat_conversations").delete().eq("id", conversationId)
  );
});
