import { agentRememberedSection } from "@/agent/memory/long-term-memory.server";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { AgentMemory } from "@/lib/agent-memory/agent-memory-schema";
import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";

// The user context: what the agent knows about this user (their settings,
// the profile details still missing, what it remembers), sent as a message
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

/**
 * The profile details every answer depends on, by account kind; the rest of
 * the settings are optional (website, writing style) or have defaults
 * (languages). EXAMPLE: list the ones your agent cannot work without.
 *
 * @returns The missing details, each as its label for the user context.
 */
export const agentProfileGaps = ({ profile, preferences }: UserSettings) =>
  (profile.kind === "business"
    ? [
        ["the business's name (name)", profile.name],
        ["what the business offers (offer)", preferences.offer],
        [
          "who its customers are, what it looks for (seeking)",
          preferences.seeking,
        ],
      ]
    : [["what they are looking for (seeking)", preferences.seeking]]
  ).flatMap(([label, value]) => (value?.trim() ? [] : [label]));

// While essential profile details are missing, filling them comes first in
// every chat (the user can skip): a rule only for that situation, so it
// comes with the context that shows the gaps.
const agentProfileGapsSection = (settings: UserSettings) => {
  const gaps = agentProfileGaps(settings);

  return gaps.length === 0
    ? ""
    : `<profile_gaps>
The user's profile is missing details that every answer depends on: ${gaps.join("; ")}.
- Getting them comes first, in any chat: before other work, ask for them in one short, friendly message, addressed to the user as <voice> says, that says how it helps them, at most two per message, the first listed first, and asks nothing else. Save each answer with updateUserSettings as soon as it comes, then carry on with what the user asked.
- A request the user already made that does not depend on a missing detail is never held for it: do it, and ask for the detail in the same answer, unless the user skipped it.
- Answer a question about how YourApp works, or small talk, first in one line, then ask.
- Once the user skips ("לא עכשיו", "אחר כך"), these gaps no longer apply in this chat: do what they ask with what you have, and never mention the missing details again, not even as an invitation for later ("כשיתאים, כתבו לי…", "כשנחפש…, כתבו מה…").
</profile_gaps>

`;
};

/**
 * The user context's text: the user's profile, preferences and automation
 * settings, the profile gaps, and what the agent remembers.
 *
 * @param settings - The user's settings.
 * @param memories - What the agent remembers about the user.
 * @returns The context, as the model reads it.
 */
export const agentUserContextText = (
  settings: UserSettings,
  memories: AgentMemory[]
) => {
  const { profile, preferences } = settings;

  // EXAMPLE settings: one line per setting the agent should know. Leave
  // empty ones out (settingLine) so the model never guesses them.
  const lines = [
    `- Account: ${profile.kind === "business" ? "business" : "private person"}`,
    ...settingLine(
      "Business name (the business, not the person)",
      profile.name
    ),
    ...settingLine("Website", profile.website),
    ...settingLine("Languages they handle", profile.languages.join(", ")),
    ...settingLine("Looking for", preferences.seeking),
    ...settingLine("Never relevant", preferences.notRelevant),
    ...settingLine("What they offer", preferences.offer),
    ...settingLine("Areas they work in or search", preferences.areas),
    ...settingLine("Writing style", preferences.writingStyle),
  ];

  return `<user_context>
From YourApp, not written by the user: the user's settings and what you remember about them, as of the message after this one. A newer <user_context> replaces this one.

<user_settings>
${lines.join("\n")}
</user_settings>

${agentProfileGapsSection(settings)}${agentRememberedSection(memories)}
</user_context>`;
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
