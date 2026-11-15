import { agentRememberedSection } from "@/agent/memory/long-term-memory.server";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { AgentMemory } from "@/lib/agent-memory/agent-memory-schema";
import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";

// The user context: what the agent knows about this user (their settings
// and what it remembers), sent as a message
// of its own instead of in the instructions, as DeepSeek's "current context"
// snapshot and Claude Code's first-message reminder are. The instructions
// then stay the same for every user and every turn, so OpenAI's prompt cache
// keeps their start (agentPromptCacheOptions), and a settings or memory
// change mid-chat appends a new context instead of rewriting the start.
//
// The context is stored with the user's message it came with, as a
// data-userContext part (withAgentUserContext), only when it differs from
// the newest one before; the model reads it as its own message just before
// that user message (agentChatModelHistory). The page sends only text and
// file parts (agentChatSentPartsSchema), so it cannot write one.

// The part a user message stores its user context in.
const userContextPart = "data-userContext";

const settingLine = (label: string, value: string) =>
  value.trim() ? [`- ${label}: ${value.trim()}`] : [];

// KeepInTax change (Phase 3.1, plan §2.10, A19; GUIDE.md "What KeepInTax
// changed"): the template's <profile_gaps> section and its gaps
// (agentProfileGaps: the business's name, what it offers and seeks) are
// removed. They made the agent ask for profile details "first, in any
// chat", before an ordinary request such as a fuel question (plan
// Appendix A, F1). The template's lead-generation settings (seeking, offer,
// areas, notRelevant) are not read into the context either: KeepInTax does
// not use them, and an empty one was read as something to ask for. The
// agent asks only what the current request needs (agent-instructions.ts,
// <clarification>); onboarding is started by the user (Phase 4, A19).

/**
 * The user context's text: the account settings the agent uses and what it
 * remembers.
 *
 * @param settings - The user's settings.
 * @param memories - What the agent remembers about the user.
 * @param businesses - The user's businesses section, or empty.
 * @returns The context, as the model reads it.
 */
export const agentUserContextText = (
  settings: UserSettings,
  memories: AgentMemory[],
  // KeepInTax (2026-11-15): the user's businesses and the conversation's
  // business (agentBusinessesSection); empty when there are none to list.
  businesses = ""
) => {
  const { profile, preferences } = settings;

  // One line per setting the agent should know. Empty ones are left out
  // (settingLine), so the model never guesses them, and an empty one is
  // never a question to ask.
  const lines = [
    `- Account: ${profile.kind === "business" ? "business" : "private person"}`,
    ...settingLine(
      "Business name (the business, not the person)",
      profile.name
    ),
    ...settingLine("Website", profile.website),
    ...settingLine("Languages they handle", profile.languages.join(", ")),
    ...settingLine("Writing style", preferences.writingStyle),
  ];

  return `<user_context>
From KeepInTax, not written by the user: the user's settings and what you remember about them, as of the message after this one. A newer <user_context> replaces this one.

<user_settings>
${lines.join("\n")}
</user_settings>

${agentRememberedSection(memories)}
${
  businesses === ""
    ? ""
    : `
${businesses}
`
}</user_context>`;
};

const isAgentUserContextPart = (part: AgentChatMessagePart) =>
  part.type === userContextPart;

/**
 * The newest user context stored in these messages.
 *
 * @param messages - The conversation's messages, oldest first.
 * @returns The context's text, or null when none is stored.
 */
export const latestAgentUserContext = (
  messages: readonly AgentChatMessage[]
) => {
  for (const message of messages.toReversed()) {
    const part = message.parts.findLast(isAgentUserContextPart);

    if (part?.type === userContextPart) {
      return part.data.text;
    }
  }

  return null;
};

/**
 * The messages with the user context stored on the newest one when it is the
 * user's and the context differs from the newest one before it (a retried
 * message gets the current context again). Any other last message is left
 * as it is.
 *
 * @param messages - The conversation's messages, oldest first.
 * @param context - The current user context (agentUserContextText).
 * @returns The messages to store and answer.
 */
export const withAgentUserContext = (
  messages: AgentChatMessage[],
  context: string
): AgentChatMessage[] => {
  const last = messages.at(-1);

  if (last?.role !== "user") {
    return messages;
  }

  const earlier = messages.slice(0, -1);
  const parts = last.parts.filter((part) => !isAgentUserContextPart(part));

  return [
    ...earlier,
    {
      ...last,
      parts:
        latestAgentUserContext(earlier) === context
          ? parts
          : [{ type: userContextPart, data: { text: context } }, ...parts],
    },
  ];
};
