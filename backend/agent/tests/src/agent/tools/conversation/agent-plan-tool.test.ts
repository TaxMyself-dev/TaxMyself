import { assert, describe, it } from "@effect/vitest";

import { repairAgentPlanInput } from "../../../../../src/agent/tools/conversation/agent-plan-tool";

// A plan whose status carries its reason ("cancelled: no matching tasks") is
// repaired instead of refused: the status keeps its word and the reason
// joins the step's text. Anything else stays refused.

const plan = (steps: { text: string; status: string }[]) =>
  JSON.stringify({ steps });

describe("agent plan repair", () => {
  it("a status with its reason keeps the word, and the reason moves to the text", () => {
    assert.strictEqual(
      repairAgentPlanInput(
        plan([
          { text: "לבדוק משימות קיימות", status: "completed" },
          {
            text: "לקרוא משימות",
            status: "cancelled: אין משימות",
          },
        ])
      ),
      plan([
        { text: "לבדוק משימות קיימות", status: "completed" },
        { text: "לקרוא משימות: אין משימות", status: "cancelled" },
      ])
    );
  });

  it("a status that is no status word stays refused", () => {
    assert.isNull(
      repairAgentPlanInput(plan([{ text: "לחפש", status: "done" }]))
    );
  });

  it("input that is not a plan stays refused", () => {
    assert.isNull(repairAgentPlanInput("not json"));
  });
});
