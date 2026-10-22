import { generateText } from "ai";
import { DateTime, Effect } from "effect";

import { readStoredAgentChatMessages } from "@/agent/chat/messages/agent-chat-message-storage.server";
import type { AgentChatMessageInvalidError } from "@/agent/chat/messages/agent-chat-message-storage.server";
import { AgentLanguageModel } from "@/agent/core/model/agent-model";
import { AgentModelCallError } from "@/agent/core/model/agent-model-call-error";
import { agentOpenAiPrivacyOptions } from "@/agent/core/model/agent-openai-privacy";
import { recordAgentUsage } from "@/agent/core/model/agent-usage.server";
import { agentChatMessageText } from "@/lib/agent-chat/conversation/agent-chat-messages";
import { langfuseCallTelemetry } from "@/server/integrations/langfuse-tracing.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

import { trimEndCharacters } from "../../../../backend/shared/text/trim-text-end";

// A new chat's title, as chat apps name chats: a few words from
// what the user asked, written once an answer ends, until the chat has one. It is
// saved only while the chat has no name, so a name the user gave always
// wins, even one given while the title was being written.

const agentChatTitleMaxLength = 60;

const agentChatTitleNone = "NONE";

const agentChatTitlePrompt = `Write a title for a chat in YourApp. 2 to 5 words naming what the user asked about, written in the same language as the user's question. Examples: "Research on solar installers", "משימות לשבוע הבא", "Email to the landlord". No quotes, no period, no emoji. If the user has not said what they want yet (only a greeting or small talk), reply ${agentChatTitleNone}. Reply with the title only.`;

/**
 * The saved title, or null when the chat already has a name or nothing to
 * name it by yet (such as only "היי"; the next answer tries again).
 */
export const nameStoredAgentChatConversation = Effect.fn(
  "nameStoredAgentChatConversation"
)(function* nameStoredAgentChatConversation(
  supabase: UserSupabaseClient,
  userId: string,
  conversationId: string
): Effect.fn.Return<
  string | null,
  SupabaseQueryError | AgentChatMessageInvalidError | AgentModelCallError,
  AgentLanguageModel
> {
  const messages = yield* readStoredAgentChatMessages(supabase, conversationId);

  // The user's messages so far: a chat that opened with a greeting is named
  // by what came after it.
  const question = messages
    .flatMap((message) =>
      message.role === "user" ? [agentChatMessageText(message)] : []
    )
    .join("\n")
    .slice(0, 2000);

  if (!question.trim()) {
    return null;
  }

  const answer = agentChatMessageText(
    messages.findLast((message) => message.role === "assistant")
  ).slice(0, 2000);

  const { model } = yield* AgentLanguageModel;
  const telemetry = yield* langfuseCallTelemetry("agent-chat-title");

  const { text, usage } = yield* Effect.tryPromise({
    try: async (abortSignal) =>
      await generateText({
        model,
        telemetry,
        instructions: agentChatTitlePrompt,
        prompt: `<question>\n${question}\n</question>\n<answer>\n${answer}\n</answer>`,
        providerOptions: {
          openai: {
            reasoningEffort: "none",
            ...agentOpenAiPrivacyOptions(userId),
          },
        },
        abortSignal,
      }),
    catch: (cause) => new AgentModelCallError({ cause }),
  });

  yield* recordAgentUsage(supabase, conversationId, "title", [usage]);

  const title = trimEndCharacters(
    text.trim().replace(/^["'״׳]+/u, ""),
    "\"'״׳."
  )
    .slice(0, agentChatTitleMaxLength)
    .trim();

  if (!title || title === agentChatTitleNone) {
    return null;
  }

  const updatedAt = DateTime.formatIso(yield* DateTime.now);

  const { data } = yield* runSupabaseQuery("AGENT_CHAT_WRITE_FAILED", () =>
    supabase
      .from("agent_chat_conversations")
      .update({ name: title, updated_at: updatedAt })
      .eq("id", conversationId)
      .is("name", null)
      .select("name")
  );

  return data.length > 0 ? title : null;
});
