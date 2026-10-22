import { isToolUIPart } from "ai";
import type { InferUITools, ToolUIPart, UIMessage } from "ai";
import { Schema } from "effect";

import type { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import type { TaskOpportunity } from "@/lib/opportunities/task-opportunity-schema";

import { IsoDateTimeString } from "../../../../backend/shared/schema/iso-date-time";

// The agent chat's messages are the AI SDK's UI messages for the app
// agent: a role, typed parts (text, reasoning, files, one tool-{name} part
// per tool call) and when the message was written. They are stored as they
// are in agent_chat_messages (see agent-chat-message-storage.server.ts).

// finishedAt: when an answer ended (the chat's "עבד במשך"); user messages
// and answers saved before it was kept have none.
export const agentChatMessageMetadataSchema = Schema.Struct({
  createdAt: IsoDateTimeString,
  finishedAt: Schema.optionalKey(IsoDateTimeString),
});

/**
 * What a chat message carries beside its parts: when it was created and
 * finished, as agentChatMessageMetadataSchema describes.
 */
export type AgentChatMessageMetadata =
  typeof agentChatMessageMetadataSchema.Type;

// What one message to the agent may hold, checked by the composer as the user
// writes and again by the chat endpoint (5 files of up to
// 10 MB).
export const agentChatMessageMaxLength = 5000;
export const agentChatMaxFiles = 5;
export const agentChatMaxFileBytes = 10 * 1024 * 1024;

/**
 * Its data parts: opportunities, retry (a model call tried again) and
 * searchProgress are what the chat page receives beyond the answer
 * (AgentChatPageData), transient: shown, never stored. documentText is stored with the user's
 * message and never shown. followUps is stored with the answer: the questions
 * shown as buttons under it, written after it ended
 * (agent-follow-up-questions.ts). Written inline: UIMessage needs an object
 * type's implicit index signature.
 */
export type AgentChatMessage = UIMessage<
  AgentChatMessageMetadata,
  {
    // What the agent knew about the user when this message came
    // (agent-user-context.ts); the server writes it, the page never shows it.
    userContext: { text: string };
    // A stop hook's note that sent the answer back (agent-stop-hooks.ts),
    // kept where it came so later turns read it too; never shown.
    agentNote: { text: string };
    // A message the user sent into the answer, where the agent read it
    // (agent-chat-user-steers.ts); shown as the user's own message.
    userSteer: { id: string; text: string; createdAt: string };
    opportunities: TaskOpportunity[];
    retry: { attempt: number; of: number };
    searchProgress: AgentChatSearchProgress;
    followUps: { questions: string[] };
    // The answer gets follow-ups, written after it ends: the page fetches
    // them (agent-chat-turn-stream.server.ts); transient.
    followUpsPending: Record<string, never>;
    documentText: {
      documentId: string | null;
      filename: string;
      text: string | null;
      length: number;
    };
  },
  InferUITools<typeof appAgentTools>
>;

/**
 * One part of a chat message.
 */
export type AgentChatMessagePart = AgentChatMessage["parts"][number];

/**
 * A slow search (searchWeb, example-web-search-tool.ts) as it runs, for the
 * status line until it ends.
 */
export interface AgentChatSearchProgress {
  toolCallId: string;
  done: number;
  of: number;
}

/**
 * A message's written text, its text parts in order.
 *
 * @param message - The message, if any.
 * @returns The text, its parts joined by blank lines; an empty string without a
 *   message.
 */
export const agentChatMessageText = (message: AgentChatMessage | undefined) =>
  message?.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n") ?? "";

/**
 * An attached document as its user message keeps it, right after the
 * document's file part: its start (agentChatDocumentPreviewLength) and its
 * whole length, so the agent reads it in every turn, and documentId, its
 * whole text in agent_chat_documents for readAttachedDocument. text and
 * documentId are null when nothing could be read, such as a scanned PDF or
 * a locked file.
 */
export type AgentChatDocumentText = Extract<
  AgentChatMessagePart,
  { type: "data-documentText" }
>["data"];

/**
 * A tool call in a message, of one of the agent's tools or a dynamic one.
 */
export type AgentChatToolPart = Extract<
  AgentChatMessagePart,
  { toolCallId: string }
>;

/**
 * A tool call's lifecycle, as the AI SDK names it: the input streams in, the
 * tool runs, may wait for approval, and ends with an output, a denial or an
 * error.
 */
export type AgentChatToolState = ToolUIPart["state"];

/**
 * A tool runs until it has an outcome.
 *
 * @param state - The tool part's state.
 * @returns Whether the tool is still running.
 */
export const agentChatToolRunning = (state: AgentChatToolState) =>
  !state.startsWith("output-");

// Add your tools that render a card of their own (a results list, a
// record) here, with their component in AgentChatAnswerPart.
const agentChatToolsWithOwnView = new Set<AgentChatToolPart["type"]>([
  "tool-suggestTrackingTasks",
  "tool-updatePlan",
  "tool-askUserQuestion",
  "tool-searchWeb",
]);

/**
 * Tools the answer shows as their own card, with their own progress:
 * suggested tasks, the agent's plan, a question with answers to pick, and
 * the example web search's results. Every other tool shows in the status
 * line while it runs and as a work log row after; a finished one may show
 * its result below the row (the tasks it changed, the opportunities it
 * listed).
 *
 * @param part - The tool call's part.
 * @returns Whether it has its own card.
 */
export const agentChatToolHasOwnView = (part: AgentChatToolPart) =>
  agentChatToolsWithOwnView.has(part.type);

/**
 * The agent finding its rarer tools (toolSearch, agent-tool-search.ts) is
 * plumbing, not work for the user: it shows nowhere in the chat.
 *
 * @param part - The tool call's part.
 * @returns Whether the chat hides it.
 */
export const agentChatToolIsHidden = (part: AgentChatToolPart) =>
  part.type === "tool-toolSearch";

/**
 * Whether a part of the answer shows anything in the answer itself. Thinking
 * and a running action show only in the status line under it
 * (AgentChatStatusLine); an empty text, a step marker or a data part shows
 * nothing (the follow-ups' questions show under the answer,
 * AgentChatFollowUps). A tool with its own card, or one asking for approval,
 * shows from the start.
 *
 * @param part - The answer's part.
 * @returns Whether it shows in the answer.
 */
export const agentChatAnswerPartShows = (part: AgentChatMessagePart) => {
  if (part.type === "text") {
    return part.text.trim().length > 0;
  }

  if (!isToolUIPart(part) || agentChatToolIsHidden(part)) {
    return false;
  }

  const waitsForApproval =
    part.approval !== undefined && part.approval.isAutomatic !== true;

  return (
    agentChatToolHasOwnView(part) ||
    waitsForApproval ||
    !agentChatToolRunning(part.state)
  );
};

/**
 * The user's decision on an action the agent asks to take. An action that
 * asks first asks every time: there is no "always allow".
 */
export type AgentChatApprovalStatus = "pending" | "allowed" | "denied";

/**
 * An action the agent asks to take; nothing runs until the user decides.
 */
export interface AgentChatApproval {
  title: string;
  summary: string;
  status: AgentChatApprovalStatus;
}

/**
 * A file in a message, as the chat shows it. previewUrl is the image itself
 * while the page that attached it stays open; stored messages keep only the
 * name and type, so it is null after a reload.
 */
export interface AgentChatFile {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string | null;
}

const agentChatTaskPotentials = ["high", "medium", "low"] as const;

/**
 * How much a suggested task may bring, one of agentChatTaskPotentials.
 */
export type AgentChatTaskPotential = (typeof agentChatTaskPotentials)[number];

// A tracking task the agent suggests (suggestTrackingTasks); adding it saves
// it to the tasks, waiting in Suggestions.
export const agentChatSuggestedTaskSchema = Schema.Struct({
  sentence: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
  details: Schema.String.check(Schema.isMaxLength(1000)),
  location: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  potential: Schema.optionalKey(Schema.Literals(agentChatTaskPotentials)),
  // What the task will look for, shown under "What the agent will look for".
  signals: Schema.Array(Schema.String).check(Schema.isMaxLength(8)),
  // Why the agent suggests it.
  evidence: Schema.optionalKey(Schema.String),
});

/**
 * A tracking task the agent suggests: the sentence, details, place, potential,
 * what it will look for and why.
 */
export type AgentChatSuggestedTask = typeof agentChatSuggestedTaskSchema.Type;
