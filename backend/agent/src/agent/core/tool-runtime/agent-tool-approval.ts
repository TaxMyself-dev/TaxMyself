import type { ToolApprovalStatus } from "ai";
import { Option, Schema } from "effect";

import {
  agentActionRuleFor,
  isAgentRuleAction,
} from "@/lib/settings/agent-actions/agent-action-rules";
import type { AgentActionRules } from "@/lib/settings/agent-actions/agent-action-rules";

import { agentToolNeedsApproval } from "./agent-tool-traits";

// Whether a tool call runs, asks first or is refused, for the agent's
// toolApproval (app-agent.ts): the user's rule for the action when
// it takes one (agent-action-rules.ts), else its effect (agent-tool-traits.ts).
// The rules are read once per request, so a rule set during an answer
// applies from the next message.

const askUser = "user-approval";

const decodeRuleInput = Schema.decodeUnknownOption(
  Schema.Struct({ rule: Schema.String })
);

/**
 * The approval status of one tool call under the user's rules.
 *
 * @param toolCall - The call's tool and input.
 * @param rules - The user's action rules.
 * @returns Not applicable (runs), user-approval (asks), or denied with the
 *   reason the model reads.
 */
export const agentToolApproval = (
  toolCall: { toolName: string; input: unknown },
  rules: AgentActionRules
): ToolApprovalStatus | undefined => {
  const { toolName } = toolCall;

  // A rule that lets the agent act without asking is the user's to give:
  // setting one asks them first, so text in a post or page cannot.
  if (toolName === "setAgentActionRule") {
    const input = Option.getOrUndefined(decodeRuleInput(toolCall.input));

    return input?.rule === "allow" ? askUser : undefined;
  }

  if (isAgentRuleAction(toolName)) {
    const rule = agentActionRuleFor(rules, toolName);

    if (rule === "never") {
      return {
        type: "denied",
        reason: `AGENT_ACTION_NEVER: the user's rule is never to run ${toolName}. Tell them, and that they can change it in הגדרות > אוטומציה or by asking you.`,
      };
    }

    return rule === "ask" ? askUser : undefined;
  }

  return agentToolNeedsApproval(toolName) ? askUser : undefined;
};
