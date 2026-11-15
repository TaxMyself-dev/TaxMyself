import type {
  AgentChatMessage,
  AgentChatMessagePart,
  AgentChatTurnOrigin,
  AgentChatTurnOriginData,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// KeepInTax change (Phase 3.1, plan §2.7 item 4, A25; GUIDE.md "What
// KeepInTax changed"): the server records how each turn was started, as a
// data-turnOrigin part. The page sends only text and file parts
// (agentChatSentPartsSchema), so it cannot write one, and a follow-up press
// is recorded only when its text is one of the follow-ups stored under the
// answer before it. Phase 3.1 acts on one origin (agentToolApproval): a
// pressed follow-up writes nothing (no memory, setting or rule). The rules
// for the other origins come with Phase 3.2.

const turnOriginPart = "data-turnOrigin";

/**
 * A turn origin's part.
 *
 * @param origin - How the turn was started.
 * @param details - The answer whose follow-up was pressed, the question
 *   calls answered.
 * @returns The part.
 */
export const agentChatTurnOriginPart = (
  origin: AgentChatTurnOrigin,
  details: Partial<Omit<AgentChatTurnOriginData, "origin">> = {}
): AgentChatMessagePart => ({
  type: turnOriginPart,
  data: {
    origin,
    followUpOf: details.followUpOf ?? null,
    toolCallIds: details.toolCallIds ?? [],
  },
});

/**
 * The follow-up questions stored under an answer (data-followUps).
 *
 * @param message - The answer.
 * @returns Its follow-ups, none when it has none.
 */
export const agentChatStoredFollowUps = (
  message: AgentChatMessage | undefined
): string[] =>
  message?.role === "assistant"
    ? message.parts.flatMap((part) =>
        part.type === "data-followUps" ? part.data.questions : []
      )
    : [];

/**
 * The origin of a new user message: a follow-up press when the page says
 * so and the text is one of the follow-ups stored under the last answer,
 * else typed.
 *
 * @param text - The message's text.
 * @param claimsFollowUp - Whether the page sent it as a follow-up press.
 * @param last - The conversation's last stored message.
 * @returns The part to store with the message.
 */
export const agentChatUserTurnOrigin = (
  text: string,
  claimsFollowUp: boolean,
  last: AgentChatMessage | undefined
) =>
  claimsFollowUp &&
  last !== undefined &&
  agentChatStoredFollowUps(last).includes(text.trim())
    ? agentChatTurnOriginPart("follow-up", { followUpOf: last.id })
    : agentChatTurnOriginPart("typed");

/**
 * The origin of the turn being answered: the newest origin stored on the
 * last message (the user's, or the answer continued after a question's
 * answer or an approval); typed when none is stored (a message saved
 * before Phase 3.1).
 *
 * @param messages - The conversation, its newest message last.
 * @returns The turn's origin.
 */
export const agentChatTurnOriginOf = (
  messages: readonly AgentChatMessage[]
): AgentChatTurnOrigin => {
  const part = messages
    .at(-1)
    ?.parts.findLast((candidate) => candidate.type === turnOriginPart);

  return part?.type === turnOriginPart ? part.data.origin : "typed";
};
