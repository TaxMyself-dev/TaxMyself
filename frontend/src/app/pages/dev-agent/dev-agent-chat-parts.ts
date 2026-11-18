/**
 * A chat message as these helpers read it: the AI SDK's UIMessage, read
 * loosely, so this file needs no import from "ai" (the focused Karma specs
 * cannot compile its declarations).
 */
export interface DevAgentMessage {
  id: string;
  role: string;
  parts: readonly DevAgentPart[];
}

/**
 * One part of a message: its type, and whatever else it holds.
 */
export interface DevAgentPart {
  type: string;
}

type MessagePart = DevAgentPart;

// A tool part read loosely (type `tool-<name>`): the page shows every tool,
// whatever its input and output.
interface LooseToolPart {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

const asToolPart = (part: MessagePart) => part as unknown as LooseToolPart;

/**
 * One button of an askUserQuestion card: what it says and the value the
 * server accepts (Phase 3.1, A18). A question stored by the template has
 * label-only options; their label is their value.
 */
export interface DevAgentQuestionOption {
  label: string;
  value: string;
}

/**
 * An askUserQuestion card as the page shows it, from the stored part (so it
 * comes back after a reload):
 * - open: the answer stopped on it and waits for a press;
 * - answered: with the label the server stored;
 * - superseded: the user wrote a message instead;
 * - legacy: a question from before Phase 3.1, answered as a message.
 */
export interface DevAgentQuestionView {
  toolCallId: string;
  question: string;
  options: DevAgentQuestionOption[];
  status: 'streaming' | 'open' | 'answered' | 'superseded' | 'legacy';
  answeredLabel: string | null;
}

/**
 * The question card of a part, or null when the part is not a question.
 */
export const devAgentQuestionView = (part: MessagePart): DevAgentQuestionView | null => {
  const tool = asToolPart(part);

  if (tool.type !== 'tool-askUserQuestion' || typeof tool.toolCallId !== 'string') {
    return null;
  }

  const input = (tool.input ?? {}) as { question?: unknown; options?: unknown };
  const options = (Array.isArray(input.options) ? input.options : []).flatMap((option): DevAgentQuestionOption[] => {
    if (typeof option === 'string') {
      return [{ label: option, value: option }];
    }
    const typed = option as { label?: unknown; value?: unknown } | null;

    return typeof typed?.label === 'string' && typeof typed.value === 'string'
      ? [{ label: typed.label, value: typed.value }]
      : [];
  });
  const output = (tool.output ?? null) as { value?: unknown; label?: unknown; superseded?: unknown; asked?: unknown } | null;

  let status: DevAgentQuestionView['status'] = 'streaming';
  if (tool.state === 'input-available') {
    status = 'open';
  } else if (tool.state === 'output-available') {
    status = output?.superseded === true ? 'superseded' : output?.asked === true ? 'legacy' : 'answered';
  }

  return {
    toolCallId: tool.toolCallId,
    question: typeof input.question === 'string' ? input.question : '',
    options,
    status,
    answeredLabel: status === 'answered' && typeof output?.label === 'string' ? output.label : null,
  };
};

/**
 * A memory the agent saved, for the "saved" notice with its undo (A20):
 * from a finished saveAgentMemory call.
 */
export interface DevAgentSavedMemory {
  memoryId: string;
  content: string;
  kind: string;
}

/**
 * The saved memory of a part, or null when the part saved none.
 */
export const devAgentSavedMemory = (part: MessagePart): DevAgentSavedMemory | null => {
  const tool = asToolPart(part);
  const output = (tool.output ?? null) as { id?: unknown; content?: unknown; kind?: unknown } | null;

  return tool.type === 'tool-saveAgentMemory' &&
    tool.state === 'output-available' &&
    typeof output?.id === 'string' &&
    typeof output.content === 'string'
    ? { memoryId: output.id, content: output.content, kind: typeof output.kind === 'string' ? output.kind : 'preference' }
    : null;
};

/**
 * The follow-up questions of a data-followUps part.
 */
export const devAgentFollowUps = (part: MessagePart): string[] => {
  const data = (part as { data?: { questions?: unknown } }).data;

  return part.type === 'data-followUps' && Array.isArray(data?.questions)
    ? data.questions.filter((question): question is string => typeof question === 'string')
    : [];
};

/**
 * The messages with an answer's fetched follow-ups added as its stored
 * data-followUps part, once (the server saves the same part, so a reload
 * shows them too).
 */
export const withDevAgentFollowUps = <M extends DevAgentMessage>(messages: M[], messageId: string, questions: string[]): M[] =>
  questions.length === 0
    ? messages
    : messages.map((message) =>
        message.id !== messageId || message.parts.some((part) => part.type === 'data-followUps')
          ? message
          : {
              ...message,
              parts: [...message.parts, { type: 'data-followUps', data: { questions } } as MessagePart],
            } as M,
      );

/**
 * Whether the answer goes on by itself after the user acted on its last
 * message: every approval decided (the template's rule, approvalsDecided),
 * or a question the page just answered (pending holds the calls answered on
 * this page and not yet sent; the server accepts only an open question's
 * own value, once).
 */
export const devAgentShouldContinue = (
  messages: readonly DevAgentMessage[],
  pending: Set<string>,
  approvalsDecided = false,
) => {
  if (approvalsDecided) {
    return true;
  }

  const last = messages.at(-1);
  const answered = (last?.role === 'assistant' ? last.parts : []).filter((part) => {
    const tool = asToolPart(part);

    return tool.type === 'tool-askUserQuestion' && tool.state === 'output-available' && pending.has(tool.toolCallId ?? '');
  });

  for (const part of answered) {
    pending.delete(asToolPart(part).toolCallId ?? '');
  }

  return answered.length > 0;
};

/** Only approvals in the latest assistant answer can be continued. Older
 * persisted requests are shown closed even before server-side cleanup. */
export function devAgentApprovalView(part: MessagePart, messageId: string, messages: readonly DevAgentMessage[]): {id: string; active: boolean} | null {
  const tool = part as unknown as {state?: string; approval?: {id?: string; reason?: string}};
  if (typeof tool.approval?.id !== 'string') return null;
  const superseded = tool.state === 'output-denied' && tool.approval.reason === 'Superseded by a newer user message; request a fresh approval card.';
  if (tool.state !== 'approval-requested' && !superseded) return null;
  const last = messages.at(-1);
  return {id:tool.approval.id,active:tool.state === 'approval-requested' && last?.role === 'assistant' && last.id === messageId};
}
