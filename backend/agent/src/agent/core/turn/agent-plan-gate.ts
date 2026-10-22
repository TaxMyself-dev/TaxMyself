import type { SystemModelMessage } from "ai";
import { Option, Schema } from "effect";

import {
  agentPlanStepSchema,
  agentPlanStepsOnceAnswered,
} from "@/agent/tools/conversation/agent-plan-tool";

import { agentNoteList } from "./agent-note-list";

// The completion gate, one of the stop hooks (agent-stop-hooks.ts): an
// answer that ends while its plan (updatePlan) still has open steps is
// brought back to them, at most agentPlanGateReminders times; after that it
// ends as it is. Grok's TodoGate, Codex's completion audit and Prime's goal
// audit do the same; Grok ships its gate off, so the agent evals measure
// this one (docs/engineering/evals.md).
export const agentPlanGateReminders = 2;

// One finished step of the answer, as the AI SDK records it.
interface AgentPlanGateStep {
  toolCalls: readonly { toolName: string; input: unknown }[];
}

const agentPlanInput = Schema.decodeUnknownOption(
  Schema.Struct({ steps: Schema.Array(agentPlanStepSchema) })
);

/**
 * The open steps of the newest plan in these steps once the answer is
 * written (agentPlanStepsOnceAnswered: the last step in progress is the
 * answer); none without a plan.
 *
 * @param steps - The turn's steps.
 * @returns The open steps' texts.
 */
export const agentOpenPlanSteps = (steps: readonly AgentPlanGateStep[]) => {
  const plan = steps
    .flatMap((step) => step.toolCalls)
    .findLast((call) => call.toolName === "updatePlan");

  return Option.match(agentPlanInput(plan?.input), {
    onNone: () => [],
    onSome: ({ steps: planSteps }) =>
      agentPlanStepsOnceAnswered(planSteps).flatMap((step) =>
        step.status === "pending" || step.status === "in_progress"
          ? [step.text]
          : []
      ),
  });
};

/**
 * The reminder naming the plan's open steps.
 *
 * @param open - The open steps' texts.
 * @returns The reminder, as a system message.
 */
export const agentPlanGateNote = (
  open: readonly string[]
): SystemModelMessage => ({
  role: "system",
  content: `Your plan still has open steps:\n${agentNoteList(open)}\nDo them now, or mark the ones you will not do as cancelled with updatePlan and say why. Then answer again, with what is done and what is left.`,
});
