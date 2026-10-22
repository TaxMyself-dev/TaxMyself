import { convertToModelMessages } from "ai";
import type { ModelMessage } from "ai";
import { Effect } from "effect";

import { agentChatModelHistory } from "@/agent/chat/messages/agent-chat-model-history";
import {
  agentUserContextText,
  withAgentUserContext,
} from "@/agent/core/agent/agent-user-context";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { readStoredAgentMemories } from "@/agent/memory/long-term-memory.server";
import { agentSkillListMessage } from "@/agent/skills/registry/agent-skills";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import { readStoredUserSettings } from "@/server/user-data/user-settings-storage.server";

import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";
import type { createAgentEvalDatabase } from "./agent-eval-database";
import { evalMessageTime, evalUserId } from "./agent-eval-fixtures";
import type {
  AgentEvalConversation,
  AgentEvalUserStep,
} from "./agent-eval-harness";

// The user's step in an agent eval as the model reads it
// (agent-eval-harness.ts), as the chat endpoint sends it.

/**
 * The user context from the case's database as it is now, as the chat
 * endpoint reads it for each new message.
 *
 * @param supabase - The case's database.
 * @returns The user context's text.
 */
export const readAgentEvalUserContext = async (
  supabase: ReturnType<typeof createAgentEvalDatabase>
) =>
  await appRuntime.runPromise(
    Effect.all(
      [
        readStoredUserSettings(supabase, evalUserId),
        readStoredAgentMemories(supabase),
      ],
      { concurrency: "unbounded" }
    ).pipe(
      Effect.map(([settings, memories]) =>
        agentUserContextText(settings, memories)
      )
    )
  );

/**
 * The user's step as the model reads it: a message as the chat endpoint
 * sends it (with its user context when that changed, and its
 * \<message_time\>; agentChatModelHistory), or the decisions as approval
 * responses. input is what the judges read for it: the user's own message,
 * without the context.
 *
 * @param step - The user's message or approval decisions.
 * @param index - The step's place in the conversation.
 * @param earlier - The conversation so far.
 * @returns The model messages, the judges' input, and the stored messages.
 */
export const agentEvalStepMessages = async (
  step: AgentEvalUserStep,
  index: number,
  earlier: AgentEvalConversation
): Promise<{
  messages: ModelMessage[];
  input: string;
  stored: AgentChatMessage[];
}> => {
  if ("decisions" in step) {
    return {
      stored: earlier.stored,
      messages: [
        {
          role: "tool",
          content: step.decisions.map((decision) => ({
            type: "tool-approval-response" as const,
            ...decision,
          })),
        },
      ],
      input: step.decisions
        .map((decision) => {
          const reason = isNonEmptyText(decision.reason)
            ? `: ${decision.reason}`
            : "";

          return `[approval card ${decision.approved ? "approved" : "denied"}${reason}]`;
        })
        .join("\n"),
    };
  }

  const id = `eval-user-${index}`;

  const stored = withAgentUserContext(
    [
      ...earlier.stored,
      {
        id,
        role: "user",
        metadata: { createdAt: evalMessageTime },
        parts: [{ type: "text", text: step.message }],
      },
    ],
    await readAgentEvalUserContext(earlier.supabase)
  );

  // The new message as the endpoint's history reads it: its context and
  // notes, then itself.
  // The conversation starts with the skill list, as the chat sends it.
  const messages = await convertToModelMessages(
    [
      ...(earlier.stored.length === 0 ? [agentSkillListMessage()] : []),
      ...agentChatModelHistory(stored).filter(
        (message) => message.id === id || message.id.startsWith(`${id}-`)
      ),
    ],
    { tools: appAgentTools }
  );

  // The judges read the message as the model did, its time included, so
  // "today" and "an hour ago" can be checked against it.
  const own = messages.at(-1);

  const input = Array.isArray(own?.content)
    ? own.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
    : (own?.content ?? "");

  return { messages, input, stored };
};
