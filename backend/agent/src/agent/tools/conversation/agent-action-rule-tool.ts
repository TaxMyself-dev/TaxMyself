import { tool } from "ai";
import { Effect, Schema } from "effect";

import {
  agentActionRuleValues,
  agentActionTakesRule,
  agentRuleActions,
} from "@/lib/settings/agent-actions/agent-action-rules";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import {
  readStoredUserSettings,
  updateStoredUserSettings,
} from "@/server/user-data/user-settings-storage.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";

/**
 * A rule the action does not take. Its message, `<CODE>: <detail>`
 * (AGENT_ACTION_RULE_NOT_ALLOWED: …), is the tool error the model reads.
 */
export class AgentActionRuleError extends Schema.TaggedError<
  AgentActionRuleError,
  { readonly brand: unique symbol }
>()("AgentActionRuleError", { detail: Schema.String }) {
  /**
   * The error as `<CODE>: <detail>`.
   *
   * @returns The code and detail, as one line.
   */
  override get message() {
    return `AGENT_ACTION_RULE_NOT_ALLOWED: ${this.detail}`;
  }
}

// The user tells the agent once what it may do on its own ("צור משימות בלי
// לשאול", "תשאל לפני מייל"), and the rule holds from the next message
// (agent-action-rules.ts). Setting "allow" asks the user first
// (agentToolApproval), so only the user can loosen a rule.
export const setAgentActionRuleTool = tool({
  description:
    "Save the user's rule for one of your actions when they say how it should go from now on: allow (act without asking), ask (an approval card first) or never. Messages in their name take only ask or never. Applies from their next message. Returns the rule saved.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      action: Schema.Literals(agentRuleActions),
      rule: Schema.Literals(agentActionRuleValues),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ action, rule }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* setAgentActionRule() {
        if (!agentActionTakesRule(action, rule)) {
          return yield* new AgentActionRuleError({
            detail: `${action} cannot be set to ${rule}: a message in the user's name always asks or never runs`,
          });
        }

        // Read fresh, so a rule set earlier in the answer is kept.
        const { automation } = yield* readStoredUserSettings(
          context.supabase,
          context.userId
        );

        yield* updateStoredUserSettings(context.supabase, context.userId, [
          {
            field: "agentActionRules",
            value: { ...automation.agentActionRules, [action]: rule },
          },
        ]);

        return { action, rule };
      }),
      { signal: abortSignal }
    ),
});
