import type { ToolApprovalStatus } from "ai";
import { Option, Schema } from "effect";

import type { AgentChatTurnOrigin } from "@/lib/agent-chat/conversation/agent-chat-messages";
import {
  agentActionRuleFor,
  isAgentRuleAction,
} from "@/lib/settings/agent-actions/agent-action-rules";
import type { AgentActionRules } from "@/lib/settings/agent-actions/agent-action-rules";

import { isAgentToolOffered } from "../agent/agent-capabilities";
import {
  agentToolChangesData,
  agentToolNeedsApproval,
} from "./agent-tool-traits";

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

/**
 * KeepInTax change (Phase 3.1; GUIDE.md "What KeepInTax changed"): the
 * chat's approval, the template's (agentToolApproval) after two checks.
 * A tool that is not offered (agent-capabilities.ts: kept only so stored
 * conversations validate) is refused if the model calls it anyway. In a
 * turn the user started by pressing a suggested follow-up (plan §2.6,
 * §2.7 item 4), nothing that writes runs: a press continues the topic and is
 * never a request to remember, change or set up anything. The other origin
 * rules come with Phase 3.2.
 *
 * @param toolCall - The call's tool and input.
 * @param rules - The user's action rules.
 * @param origin - How the user started this turn; typed when left out.
 * @returns Not applicable (runs), user-approval (asks), or denied with the
 *   reason the model reads.
 */
export const agentChatToolApproval = (
  toolCall: { toolName: string; input: unknown },
  rules: AgentActionRules,
  origin: AgentChatTurnOrigin = "typed"
): ToolApprovalStatus | undefined => {
  const { toolName } = toolCall;

  if (!isAgentToolOffered(toolName)) {
    return {
      type: "denied",
      reason: `AGENT_TOOL_NOT_AVAILABLE: ${toolName} is not available in KeepInTax's chat. Do not try it again: tell the user plainly what is not available, and offer what you can do with your other tools.`,
    };
  }

  if (origin === "follow-up" && agentToolChangesData(toolName)) {
    return {
      type: "denied",
      reason: `AGENT_FOLLOW_UP_NO_WRITE: the user pressed a suggested follow-up question, which asks only for information; ${toolName} was not run. Answer the question; if something should be saved or changed, the user can ask for it in their own words.`,
    };
  }

  return agentToolApproval(toolCall, rules);
};
