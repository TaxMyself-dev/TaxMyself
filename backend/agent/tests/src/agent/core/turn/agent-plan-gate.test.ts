import { assert, it, describe } from "@effect/vitest";

import {
  agentOpenPlanSteps,
  agentPlanGateNote,
} from "../../../../../src/agent/core/turn/agent-plan-gate";

// The plan gate reads the newest plan's open steps and names them in its
// note; how often it sends an answer back is the stop hooks'
// (agent-stop-hooks.test.ts).

const plan = (statuses: string[]) => ({
  toolCalls: [
    {
      toolName: "updatePlan",
      input: {
        steps: statuses.map((status, index) => ({
          text: `שלב ${index + 1}`,
          status,
        })),
      },
    },
  ],
});

describe("agent plan gate", () => {
  it("names the open steps of the newest plan", () => {
    const open = agentOpenPlanSteps([
      plan(["pending", "pending"]),
      plan(["completed", "in_progress", "pending"]),
    ]);

    assert.deepStrictEqual(open, ["שלב 2", "שלב 3"]);
    const note = JSON.stringify(agentPlanGateNote(open));
    assert.include(note, "- שלב 2");
    assert.include(note, "- שלב 3");
  });

  it("the last step in progress is the answer: writing it leaves nothing open", () => {
    assert.deepStrictEqual(
      agentOpenPlanSteps([plan(["completed", "completed", "in_progress"])]),
      []
    );
    // Only the last step: one in progress before it is still open, and a
    // last step not started is not the answer being written.
    assert.deepStrictEqual(
      agentOpenPlanSteps([plan(["in_progress", "pending"])]),
      ["שלב 1", "שלב 2"]
    );
  });

  it("a plan done or cancelled, or no plan, has no open steps", () => {
    assert.deepStrictEqual(
      agentOpenPlanSteps([plan(["completed", "cancelled"])]),
      []
    );
    assert.deepStrictEqual(agentOpenPlanSteps([{ toolCalls: [] }]), []);
  });
});
