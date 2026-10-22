import { assert, describe, it } from "@effect/vitest";

import { prepareAppAgentStep } from "../../../../../src/agent/core/agent/app-agent";

// The first step of an answer cannot call updatePlan, so a plan never takes
// a model step of its own at the start; from the second step every tool is
// there again.

const ask = { role: "user" as const, content: "תמצא לי 10 משרות מלצר בחיפה" };
const firstStepTools = ["listTrackingTasks", "searchWeb", "toolSearch"];

describe("app agent steps", () => {
  it("the first step offers every tool but updatePlan", () => {
    const first = prepareAppAgentStep(
      { messages: [ask], steps: [] },
      undefined,
      firstStepTools
    );

    assert.deepStrictEqual(first?.activeTools, firstStepTools);
  });

  it("later steps offer every tool", () => {
    const later = prepareAppAgentStep(
      { messages: [ask], steps: [{ toolCalls: [], content: [] }] },
      undefined,
      firstStepTools
    );

    assert.isUndefined(later?.activeTools);
  });
});
