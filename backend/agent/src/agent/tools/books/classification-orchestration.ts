import type { ModelMessage } from "ai";
import { Option, Schema } from "effect";

import type { AgentChatTurnOrigin } from "@/lib/agent-chat/conversation/agent-chat-messages";

interface ClassificationStep {
  readonly toolCalls: readonly { toolName: string; input?: unknown }[];
  readonly toolResults?: readonly { toolName: string; output: unknown }[];
}

const decodePreparation = Schema.decodeUnknownOption(
  Schema.Struct({
    proposalId: Schema.String.check(Schema.isMinLength(1)),
    requestApproval: Schema.optionalKey(Schema.Boolean),
  })
);

const decodeApprovalCall = Schema.decodeUnknownOption(
  Schema.Struct({ proposalId: Schema.String })
);

/** Complete only the classification-to-card transition. This requests approval;
 * it never calls execute or treats an earlier approval as authorization.
 * @param steps - This answer's steps since the latest user steer.
 * @param messages - The current model history.
 * @param origin - The server-recorded turn origin.
 * @returns A forced card-tool step, or no override. */
export const prepareClassificationApprovalStep = (
  steps: readonly ClassificationStep[],
  messages: readonly ModelMessage[],
  origin: AgentChatTurnOrigin = "typed"
) => {
  if (origin === "follow-up") {
    return null;
  }

  const preparations = steps.flatMap((step) =>
    (step.toolResults ?? []).flatMap((result) =>
      result.toolName === "prepareTransactionClassification"
        ? Option.toArray(decodePreparation(result.output))
        : []
    )
  );

  const pending = preparations.at(-1);

  if (pending === undefined || pending.requestApproval === false) {
    return null;
  }

  const attempted = steps.some((step) =>
    step.toolCalls.some(
      (call) =>
        call.toolName === "classifyTransaction" &&
        Option.getOrUndefined(decodeApprovalCall(call.input))?.proposalId ===
          pending.proposalId
    )
  );

  if (attempted) {
    return null;
  }

  return {
    toolChoice: "required" as const,
    activeTools: ["classifyTransaction" as const],
    messages: [
      ...messages,
      {
        role: "system" as const,
        content: `The requested classification has a successful prepared proposal. Present its real approval card now by calling classifyTransaction with proposalId=${JSON.stringify(pending.proposalId)}. No action has executed and no card exists until this tool requests approval. Do not produce a completion message instead.`,
      },
    ],
  };
};
