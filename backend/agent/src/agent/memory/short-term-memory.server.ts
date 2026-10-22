import { getToolName, isToolUIPart } from "ai";
import { Option, Schema } from "effect";

import {
  earlierChatMessageText,
  earlierResultHeadlines,
} from "@/agent/chat/messages/agent-chat-earlier-results";
import { latestAgentUserContext } from "@/agent/core/agent/agent-user-context";
import { agentToolOutputMaxLength } from "@/agent/core/tool-runtime/agent-tool-output";
import { agentSkills } from "@/agent/skills/registry/agent-skills";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

const toolOutputAvailable = "output-available";

// The agent's short-term memory: the conversation it reads on each request.
// A long conversation keeps its newest messages as they are; the older ones
// are left out and replaced by a list of what they hold (the user's
// messages, the agent's, and what each tool found), which the agent opens in
// full with searchEarlierResults. The chat still shows every message.
//
// This replaced a summary written by the model (until 2026-10-17): Rakazo
// measured both on gpt-6-luna, and the summary failed every distant-recall
// check at 1,000 and 10,000 messages while searching the history passed
// (docs/research/agent-harness/harnesses/rakazo.md §7); in a chat of
// 2026-10-17 the summary lost a job's details and the agent searched the
// sites again.

// About 4 bytes per token, as Codex estimates a history's size. The budget
// keeps requests fast and cheap well inside gpt-6-luna's context window.
const agentShortTermTokenBudget = 48_000;
const agentShortTermBytesPerToken = 4;

// The older part is left out in steps of this many tokens, at fixed points,
// so the history's start stays the same for many requests and the prompt
// cache keeps matching: a window sliding by one message would change it on
// every request.
const agentShortTermFoldStepTokens = 16_000;

// The newest messages always reach the model as they are.
const agentShortTermRecentMessages = 6;

// The list of the older part: each message's text is cut to this, each tool
// call lists this many titles, and the whole list keeps its newest lines
// within agentEarlierListMaxLength.
const agentEarlierTextMaxLength = 300;
const agentEarlierTitleLimit = 8;
const agentEarlierListMaxLength = 12_000;

// A tool's output counts as the model reads it: stored whole, but cut to
// agentToolOutputMaxLength (agentToolModelOutput), so a few long searches do
// not fold the conversation early.
const agentModelPartBytes = (part: AgentChatMessagePart) => {
  if (!isToolUIPart(part) || part.state !== toolOutputAvailable) {
    return Buffer.byteLength(JSON.stringify(part));
  }

  const output = JSON.stringify(part.output ?? null).slice(
    0,
    agentToolOutputMaxLength
  );

  return (
    Buffer.byteLength(JSON.stringify({ ...part, output: null })) +
    Buffer.byteLength(output)
  );
};

const estimateAgentMessageTokens = (message: AgentChatMessage) =>
  message.parts.reduce((bytes, part) => bytes + agentModelPartBytes(part), 0) /
  agentShortTermBytesPerToken;

/**
 * Where the older part ends: the first of the fixed fold points (a user
 * message where the conversation so far passes another
 * agentShortTermFoldStepTokens) after which the rest fits the token budget.
 * A fold never splits an answer from its question and always leaves the
 * newest messages; when no point leaves few enough tokens, the last point
 * is used.
 *
 * @param messages - The conversation's messages, oldest first.
 * @returns The index of the first message the model reads whole, 0 when
 *   nothing is left out.
 */
export const agentShortTermFoldIndex = (messages: AgentChatMessage[]) => {
  const tokens = messages.map(estimateAgentMessageTokens);
  const total = tokens.reduce((sum, count) => sum + count, 0);

  if (total <= agentShortTermTokenBudget) {
    return 0;
  }

  let before = 0;
  let nextPoint = agentShortTermFoldStepTokens;
  let fold = 0;

  for (
    let index = 0;
    index <= messages.length - agentShortTermRecentMessages;
    index += 1
  ) {
    if (index > 0 && messages[index].role === "user" && before >= nextPoint) {
      fold = index;
      nextPoint =
        (Math.floor(before / agentShortTermFoldStepTokens) + 1) *
        agentShortTermFoldStepTokens;

      if (total - before <= agentShortTermTokenBudget) {
        return fold;
      }
    }

    before += tokens[index];
  }

  return fold;
};

const oneLine = (text: string, max: number) => {
  const line = text.replaceAll(/\s+/gu, " ").trim();

  return line.length > max ? `${line.slice(0, max)}…` : line;
};

// One message of the older part, in a few lines: who wrote it and when, its
// text, and what each of its tool calls found.
const decodeJsonPart = Schema.decodeUnknownOption(Schema.Json);

// The message's parts as JSON, as the earlier results read them; a part that
// is not JSON (none should be: every part is saved as JSON) is left out.
const jsonParts = (message: AgentChatMessage) =>
  message.parts.flatMap((part) => Option.toArray(decodeJsonPart(part)));

const agentEarlierMessageLines = (message: AgentChatMessage) => {
  const parts = jsonParts(message);
  const text = earlierChatMessageText(parts);
  const who = message.role === "user" ? "user" : "you";
  const when = message.metadata?.createdAt?.slice(0, 16);
  const header = when === undefined ? who : `${who} ${when}`;

  const found = parts.flatMap((part) => {
    const headlines = earlierResultHeadlines(part, agentEarlierTitleLimit);

    if (headlines === null) {
      return [];
    }

    const line = `  ${headlines.tool} found ${headlines.count}`;

    return [
      headlines.titles.length === 0
        ? line
        : `${line}: ${headlines.titles.join("; ")}`,
    ];
  });

  if (text.length === 0 && found.length === 0) {
    return [];
  }

  return [`- ${header}: ${oneLine(text, agentEarlierTextMaxLength)}`, ...found];
};

// The older part's list, its newest lines within agentEarlierListMaxLength.
const agentEarlierList = (folded: AgentChatMessage[]) => {
  const lines = folded.flatMap(agentEarlierMessageLines);
  const kept: string[] = [];
  let length = 0;

  for (const line of lines.toReversed()) {
    if (length + line.length > agentEarlierListMaxLength) {
      break;
    }

    kept.unshift(line);
    length += line.length + 1;
  }

  const left = lines.length - kept.length;

  return [
    ...(left === 0 ? [] : [`(${left} older lines left out)`]),
    ...kept,
  ].join("\n");
};

// loadAgentSkill's input, as the stored call kept it.
const agentLoadedSkillInput = Schema.decodeUnknownOption(
  Schema.Struct({ name: Schema.String })
);

// The playbooks loadAgentSkill loaded in these messages, in load order.
const agentLoadedSkillNames = (messages: AgentChatMessage[]) => [
  ...new Set(
    messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        isToolUIPart(part) &&
        getToolName(part) === "loadAgentSkill" &&
        part.state === toolOutputAvailable
          ? Option.toArray(agentLoadedSkillInput(part.input)).map(
              (input) => input.name
            )
          : []
      )
    )
  ),
];

// Playbooks loaded only in the older part reach the model whole after its
// list, since the list keeps only a line about them (Claude Code re-attaches
// invoked skills after compaction; Grok Bot keeps durable blocks).
const agentEarlierPlaybooks = (
  folded: AgentChatMessage[],
  recent: AgentChatMessage[]
) => {
  const reloaded = new Set(agentLoadedSkillNames(recent));

  const playbooks = agentLoadedSkillNames(folded).flatMap((name) =>
    reloaded.has(name) ? [] : agentSkills.filter((skill) => skill.name === name)
  );

  return playbooks.length === 0
    ? ""
    : `\n\n<loaded_playbooks>\nPlaybooks loaded earlier in this conversation. Follow one only while its flow is still under way.\n\n${playbooks.map((skill) => skill.content).join("\n\n")}\n</loaded_playbooks>`;
};

// How the model reads the older part: a first message ahead of the newest
// ones, the same until the next fold point so the prompt cache keeps
// matching.
const agentEarlierMessage = (
  folded: AgentChatMessage[],
  recent: AgentChatMessage[]
): AgentChatMessage => ({
  id: `earlier-${folded.at(-1)?.id ?? ""}`,
  role: "user",
  parts: [
    {
      type: "text",
      text: `<earlier_in_chat>\nThe older part of this conversation is not shown. What it holds, oldest first: who wrote each message and when, its start, and what each tool found. Open any of it in full with searchEarlierResults (words), instead of searching again. The messages after this one follow it: continue from where they leave off, without mentioning this list.\n\n${agentEarlierList(folded)}${agentEarlierPlaybooks(folded, recent)}\n</earlier_in_chat>`,
    },
  ],
});

/**
 * The messages the model reads for this request: the conversation as it is,
 * or, once it outgrows the token budget, a list of its older part followed
 * by the newest messages.
 *
 * @param messages - The conversation's messages, oldest first.
 * @returns The messages to send to the model.
 */
export const agentShortTermHistory = (
  messages: AgentChatMessage[]
): AgentChatMessage[] => {
  const fold = agentShortTermFoldIndex(messages);

  if (fold === 0) {
    return messages;
  }

  const folded = messages.slice(0, fold);
  const recent = messages.slice(fold);

  // The newest user context in the older part still holds until a newer one
  // comes, so it follows the list (and stays the same until the next fold
  // point, for the prompt cache).
  const foldedContext = latestAgentUserContext(folded);

  return [
    agentEarlierMessage(folded, recent),
    ...(foldedContext === null
      ? []
      : [
          {
            id: `earlier-context-${folded.at(-1)?.id ?? ""}`,
            role: "user" as const,
            parts: [
              {
                type: "data-userContext" as const,
                data: { text: foldedContext },
              },
            ],
          },
        ]),
    ...recent,
  ];
};
