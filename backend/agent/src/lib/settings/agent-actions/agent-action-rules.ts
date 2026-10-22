import { Schema } from "effect";

// What the agent may do on its own, the user's rules per action: allow (it
// acts without asking), ask (an approval card first) or never (it may not).
// The user sets them once in Settings, with "always allow" on an
// approval card, or by telling the agent (setAgentActionRule); the agent's
// toolApproval reads them on every call (app-agent.ts), as
// OpenMausBot's approval levels and Rakazo's always-allow rules are read
// (docs/research/agent-harness/guides/always-on-agents.md §4).
//
// Each action is one agent tool. An action without a rule keeps its default:
// actions the user cannot take back, or that act outside the app in their
// name, ask; the rest are allowed. Sending something in the user's name can never
// be allowed: it asks or never runs (OpenMausBot's outbound messages always
// confirm).

export const agentActionRuleValues = ["allow", "ask", "never"] as const;

/**
 * The user's rule for one agent action.
 */
export type AgentActionRule = (typeof agentActionRuleValues)[number];

// The actions a rule can be set for, in the order Settings shows them.
// Add each of your tools that changes something.
export const agentRuleActions = [
  "createTrackingTask",
  "updateTrackingTask",
  "deleteTrackingTasks",
  "updateUserSettings",
  "saveAgentMemory",
  "sendEmail",
] as const;

/**
 * An agent action a rule can be set for.
 */
export type AgentRuleAction = (typeof agentRuleActions)[number];

/**
 * Each action's default and the rules it takes.
 */
export const agentActionRuleActions = {
  createTrackingTask: { default: "allow", rules: agentActionRuleValues },
  updateTrackingTask: { default: "allow", rules: agentActionRuleValues },
  deleteTrackingTasks: { default: "ask", rules: agentActionRuleValues },
  updateUserSettings: { default: "allow", rules: agentActionRuleValues },
  saveAgentMemory: { default: "allow", rules: agentActionRuleValues },
  sendEmail: { default: "ask", rules: ["ask", "never"] },
} as const satisfies Record<
  AgentRuleAction,
  { default: AgentActionRule; rules: readonly AgentActionRule[] }
>;

const agentRuleActionNames: ReadonlySet<string> = new Set(agentRuleActions);

/**
 * Whether a tool is an action a rule can be set for.
 *
 * @param toolName - The tool's name.
 * @returns Whether it takes a rule.
 */
export const isAgentRuleAction = (
  toolName: string
): toolName is AgentRuleAction => agentRuleActionNames.has(toolName);

const agentActionRuleField = Schema.optionalKey(
  Schema.Literals(agentActionRuleValues)
);

// The rules the user set; an action left out keeps its default.
export const agentActionRulesSchema = Schema.Struct({
  createTrackingTask: agentActionRuleField,
  updateTrackingTask: agentActionRuleField,
  deleteTrackingTasks: agentActionRuleField,
  updateUserSettings: agentActionRuleField,
  saveAgentMemory: agentActionRuleField,
  sendEmail: agentActionRuleField,
});

/**
 * The rules the user set, by action.
 */
export type AgentActionRules = typeof agentActionRulesSchema.Type;

/**
 * Whether an action takes this rule (an email in the user's name is never
 * allowed without asking).
 *
 * @param action - The action.
 * @param rule - The rule.
 * @returns Whether the action takes it.
 */
export const agentActionTakesRule = (
  action: AgentRuleAction,
  rule: AgentActionRule
) => agentActionRuleActions[action].rules.some((allowed) => allowed === rule);

/**
 * The rule an action runs under: the user's, when it is one the action
 * takes, else the action's default.
 *
 * @param rules - The user's rules.
 * @param action - The action.
 * @returns The rule.
 */
export const agentActionRuleFor = (
  rules: AgentActionRules,
  action: AgentRuleAction
): AgentActionRule => {
  const rule = rules[action];

  return rule !== undefined && agentActionTakesRule(action, rule)
    ? rule
    : agentActionRuleActions[action].default;
};
