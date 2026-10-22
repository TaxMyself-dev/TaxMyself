import { Option, Schema } from "effect";

import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

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
      if (!("approval" in part) || part.state !== "approval-requested") {
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
