import { tool } from "ai";
import { Option, Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// The agent's plan for one answer, shown in the chat as a live checklist
// (AgentChatPlan): Codex's update_plan and Claude Code's TodoWrite. Nothing
// is stored apart from the call itself; each call sends the whole list. An
// answer whose plan still has open steps is brought back to them
// (agent-plan-gate.ts).
export const agentPlanStepStatuses = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const agentPlanStepSchema = Schema.Struct({
  text: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(120)
  ).annotate({
    description:
      "The step in a few words, in the user's language; for a cancelled step, why",
  }),
  status: Schema.Literals(agentPlanStepStatuses).annotate({
    description:
      "pending: not started. in_progress: what you are doing now, exactly one at a time. completed: done. cancelled: you will not do it",
  }),
});

export const updatePlanTool = tool({
  description:
    "Show your plan as a checklist in the chat and keep it current. Only for work of 3 or more steps, or several requests in one message. Send the whole list each time, one step in_progress; mark each completed when done. Call it in the same step as your next tool calls, never in a step of its own: each step costs the user seconds. With your last tool calls, mark the work completed and the last step (the answer) in_progress: answering completes it. Every other step ends completed, or cancelled with the reason in its text.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      steps: Schema.Array(agentPlanStepSchema).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(10)
      ),
    })
  ),
  execute: () => ({ updated: true }),
});

/**
 * The plan as it stands once the answer is written: its last step, in
 * progress, is the answer itself, so answering completes it. The agent then
 * spends no model step marking it, which a plan update alone in a step
 * did in 19% of the agent's steps (final-1016g, 2026-10-16).
 *
 * @param steps - The plan's steps.
 * @returns The steps, the last one completed when it was in progress.
 */
export const agentPlanStepsOnceAnswered = <
  Step extends { status: (typeof agentPlanStepStatuses)[number] },
>(
  steps: readonly Step[]
): Step[] =>
  steps.map((step, index) =>
    index === steps.length - 1 && step.status === "in_progress"
      ? { ...step, status: "completed" }
      : step
  );

// A status as the model sometimes writes it, with its reason after it
// ("cancelled: אין משימות"), which the tool's input refused.
const agentPlanStatusWord = /^(?:pending|in_progress|completed|cancelled)\b/u;
const agentPlanReasonStart = /^[\s:,.-]+/u;

// The status word and what follows it, or null without one.
const splitAgentPlanStatus = (written: string) => {
  const status = agentPlanStatusWord.exec(written)?.[0];

  return status === undefined
    ? null
    : {
        status,
        reason: written
          .slice(status.length)
          .replace(agentPlanReasonStart, "")
          .trim(),
      };
};

const agentPlanStepMaxLength = 120;

const decodeLooseAgentPlan = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      steps: Schema.Array(
        Schema.Struct({ text: Schema.String, status: Schema.String })
      ),
    })
  )
);

/**
 * An updatePlan call's input with each status cut to its word and its
 * reason moved into the step's text, as the tool asks; null when that does
 * not make it a valid plan. For the agent's repairToolCall: a refused plan
 * cost a model step to send again (a real chat, 2026-10-16).
 *
 * @param input - The call's input, as the model wrote it (JSON text).
 * @returns The repaired input as JSON text, or null.
 */
export const repairAgentPlanInput = (input: string) =>
  Option.match(decodeLooseAgentPlan(input), {
    onNone: () => null,
    onSome: ({ steps }) => {
      const repaired = steps.map((step) => {
        const split = splitAgentPlanStatus(step.status.trim());
        const reason = split?.reason ?? "";

        return {
          text: (reason === "" ? step.text : `${step.text}: ${reason}`).slice(
            0,
            agentPlanStepMaxLength
          ),
          status: split?.status ?? step.status,
        };
      });

      return repaired.every((step) => Schema.is(agentPlanStepSchema)(step))
        ? JSON.stringify({ steps: repaired })
        : null;
    },
  });
