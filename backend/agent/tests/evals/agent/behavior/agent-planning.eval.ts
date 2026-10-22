import { describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  agentPlanStepStatuses,
  agentPlanStepsOnceAnswered,
} from "@/agent/tools/conversation/agent-plan-tool";

import { evalOpportunity, evalTask } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { calledToolNames } from "../harness/agent-eval-run-checks";

// Work of several steps is planned (updatePlan) and finished: every part of
// the request done, and the plan closed. A choice between a few clear answers
// is asked with buttons (askUserQuestion), and a simple question needs no
// plan. A message of several requests plans from its first step
// (agent-turn-signals.ts "several").

const planSteps = Schema.decodeUnknownSync(
  Schema.Struct({
    steps: Schema.Array(
      Schema.Struct({
        text: Schema.String,
        status: Schema.Literals(agentPlanStepStatuses),
      })
    ),
  })
);

describe.concurrent("planning", () => {
  it("plans a request of several parts and finishes every part", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { tasks: [evalTask()], opportunities: [evalOpportunity()] },
      [
        "Create a task to find restaurants in Chicago that need a bookkeeper, scanning every hour with alerts. Then tell me what was scanned lately and what my latest opportunities are",
      ]
    );

    const called = calledToolNames(run);
    // Step: the answer showed a plan.
    expect(called).toContain("updatePlan");
    // Step: every part of the request was done.
    expect(
      run.writes.some(
        (write) => write.table === "tracking_tasks" && write.action === "insert"
      ),
      "the task was created"
    ).toBe(true);
    expect(called).toContain("listRecentScans");
    expect(called).toContain("listTaskOpportunities");

    // Step: the last plan has no step left open, as the chat shows it once
    // the answer is written (its last step in progress is the answer).
    const lastPlan = run.toolCalls.findLast(
      (call) => call.name === "updatePlan"
    );

    const open = agentPlanStepsOnceAnswered(
      planSteps(lastPlan?.inputParameters).steps
    ).filter(
      (step) => step.status === "pending" || step.status === "in_progress"
    );

    expect(open).toEqual([]);
  });

  it("asks with buttons whether to set up a new task with the defaults", async ({
    expect,
  }) => {
    const run = await runAgentConversation({}, [
      "Create a task to find dental clinics in Chicago that need payroll help",
    ]);

    expect(calledToolNames(run)).toContain("askUserQuestion");
    // Step: nothing is created before the user answers.
    expect(
      run.writes.some((write) => write.table === "tracking_tasks"),
      "no task yet"
    ).toBe(false);
  });

  it("answers a simple question without a plan", async ({ expect }) => {
    const run = await runAgentConversation({ tasks: [evalTask()] }, [
      "What are my tasks?",
    ]);

    expect(calledToolNames(run)).not.toContain("updatePlan");
  });
});
