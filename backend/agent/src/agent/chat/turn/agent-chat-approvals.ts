import { Option, Schema } from "effect";

import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

const approvalRequestedState = "approval-requested";

const agentChatApprovalDecisionSchema = Schema.Struct({
  type: Schema.String,
  approval: Schema.Struct({
    id: Schema.String,
    approved: Schema.Boolean,
    reason: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  }),
});

const decodeAgentChatApprovalDecision = Schema.decodeUnknownOption(
  agentChatApprovalDecisionSchema
);

/**
 * The page may only answer the approvals the agent asked for: each stored
 * approval request takes the page's decision for it, and nothing else in the
 * stored message changes.
 *
 * @param stored - The stored message that asked for the approvals.
 * @param sentParts - The parts the page sent back, with its decisions.
 * @returns The stored message with the page's decisions applied.
 */
export const applyAgentChatApprovals = (
  stored: AgentChatMessage,
  sentParts: readonly unknown[]
): AgentChatMessage => {
  const decisions = new Map(
    sentParts.flatMap((part) => {
      const parsed = decodeAgentChatApprovalDecision(part);

      return Option.isSome(parsed)
        ? [[parsed.value.approval.id, parsed.value.approval]]
        : [];
    })
  );

  return {
    ...stored,
    parts: stored.parts.map((part): AgentChatMessagePart => {
      if (!("approval" in part) || part.state !== approvalRequestedState) {
        return part;
      }

      const decision = decisions.get(part.approval.id);

      return decision
        ? {
            ...part,
            state: "approval-responded",
            approval: {
              ...part.approval,
              approved: decision.approved,
              reason: decision.reason,
            },
          }
        : part;
    }),
  };
};

/** System closure, distinct from an explicit user denial. */
export const supersededAgentApprovalReason =
  "Superseded by a newer user message; request a fresh approval card.";

/** Close approval requests that cannot be continued after a new typed turn.
 * Completed actions and explicit decisions remain unchanged.
 * @param message - The last stored message before the new user turn.
 * @returns The closed message, or null if it had no open approvals. */
export const supersedeOpenAgentApprovals = (
  message?: AgentChatMessage
): AgentChatMessage | null => {
  if (
    message?.role !== "assistant" ||
    !message.parts.some(
      (part) => "approval" in part && part.state === approvalRequestedState
    )
  ) {
    return null;
  }

  return {
    ...message,
    parts: message.parts.map((part): AgentChatMessagePart =>
      "approval" in part && part.state === approvalRequestedState
        ? {
            ...part,
            state: "output-denied",
            approval: {
              ...part.approval,
              approved: false,
              reason: supersededAgentApprovalReason,
            },
          }
        : part
    ),
  };
};
