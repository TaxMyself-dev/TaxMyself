import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// A message the user sends while the agent answers joins that answer at the
// agent's next step (Pi's steering messages), instead of waiting for the
// answer to end: the server keeps it until the step takes it
// (agent-chat-user-steers.server.ts), and the answer stores it where it was
// read as a data-userSteer part. The page shows it there as the user's own
// message, and later turns read it there too (agentChatModelHistory). One
// the answer ended without reading goes out as a new message, as queued
// messages do (agent-chat-queue.ts).

const agentChatUserSteerPart = "data-userSteer";

/**
 * A message sent into a running answer, as its data-userSteer part keeps it.
 */
export interface AgentChatUserSteer {
  id: string;
  text: string;
  createdAt: string;
}

/**
 * A steer as a message of the user's.
 *
 * @param steer - The steer.
 * @returns The user message.
 */
export const agentChatUserSteerMessage = (
  steer: AgentChatUserSteer
): AgentChatMessage => ({
  id: steer.id,
  role: "user",
  metadata: { createdAt: steer.createdAt },
  parts: [{ type: "text", text: steer.text }],
});

// One stretch of an answer between its steers, as a message of its own: it
// started when the answer did or at the steer before it, and ended at the
// steer after it or when the answer did.
const agentChatAnswerStretch = (
  answer: AgentChatMessage,
  parts: AgentChatMessagePart[],
  index: number,
  from: string | undefined,
  to: string | undefined
): AgentChatMessage => {
  const { metadata } = answer;
  const createdAt = from ?? metadata?.createdAt;
  const finishedAt = to ?? metadata?.finishedAt;

  return {
    ...answer,
    id: index === 0 ? answer.id : `${answer.id}-steer-${index}`,
    parts,
    ...(createdAt !== undefined && {
      metadata: {
        createdAt,
        ...(finishedAt !== undefined && { finishedAt }),
      },
    }),
  };
};

/**
 * An answer split where the user wrote into it: its stretches, with each
 * steer as the user's message between them. An answer without steers stays
 * as it is; a stretch with no parts is left out.
 *
 * @param answer - The answer.
 * @returns The answer's messages in order.
 */
export const agentChatAnswerWithSteers = (
  answer: AgentChatMessage
): AgentChatMessage[] => {
  const steers = answer.parts.flatMap((part) =>
    part.type === agentChatUserSteerPart ? [part.data] : []
  );

  if (answer.role !== "assistant" || steers.length === 0) {
    return [answer];
  }

  const stretches: AgentChatMessagePart[][] = [[]];

  for (const part of answer.parts) {
    if (part.type === agentChatUserSteerPart) {
      stretches.push([]);
    } else {
      stretches.at(-1)?.push(part);
    }
  }

  return stretches.flatMap((parts, index) => {
    const steer = steers.at(index);

    return [
      ...(parts.length === 0
        ? []
        : [
            agentChatAnswerStretch(
              answer,
              parts,
              index,
              index > 0 ? steers[index - 1]?.createdAt : undefined,
              steer?.createdAt
            ),
          ]),
      ...(steer === undefined ? [] : [agentChatUserSteerMessage(steer)]),
    ];
  });
};
