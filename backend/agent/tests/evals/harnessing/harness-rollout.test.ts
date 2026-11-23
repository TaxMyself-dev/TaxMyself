import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import {
  executeHarnessRollout,
  rolloutDeliverableText,
  rolloutTaskText,
  rolloutTrajectoryText,
} from "./harness-rollout";

// What the method reads back from a rollout's trace: the user's messages
// (never the case's name), the trajectory in the [ACTION]/[OBSERVATION]
// grammar with long observations cut by a marker, and the answer.

const caseId =
  "agent/searches/x.eval.ts > x > finds rentals in the user's city";

interface TraceFixture {
  readonly input: string;
  readonly output: string;
  readonly steps: readonly object[];
}

const runWithTrace = (trace: TraceFixture) => {
  const dir = mkdtempSync(path.join(tmpdir(), "harness-rollout-"));

  writeFileSync(
    path.join(dir, "traces.jsonl"),
    `${JSON.stringify({ case_id: caseId, error: null, ...trace })}\n`
  );

  return dir;
};

const searchTrace = (observation: string) => ({
  input: "Find me an accountant in Chicago",
  output: "I found one accountant.",
  steps: [
    { type: "llm", name: "step 1", output: "Searching." },
    {
      type: "tool",
      name: "sendEmail",
      input: { query: "Chicago" },
      output: observation,
    },
    { type: "llm", name: "step 2", output: "I found one accountant." },
  ],
});

describe("harness rollout", () => {
  it("the task is the user's messages, never the case's name", () => {
    const text = rolloutTaskText(runWithTrace(searchTrace("ok")));

    assert.include(text, "Find me an accountant in Chicago");
    assert.notInclude(text, "finds rentals");
  });

  it("the trajectory shows each model step, tool call, result and the answer in order", () => {
    const text = rolloutTrajectoryText(
      runWithTrace(searchTrace("one listing"))
    );

    const order = [
      "[ACTION] model step 1 wrote: Searching.",
      '[ACTION] tool sendEmail called with {"query":"Chicago"}',
      '[OBSERVATION] "one listing"',
      "[ACTION] model step 2 wrote: I found one accountant.",
      "## The answer the user saw",
    ].map((line) => text.indexOf(line));

    assert.notInclude(order, -1);
    assert.deepStrictEqual(
      order,
      order.toSorted((a, b) => a - b)
    );
  });

  it("an observation of 50,000 characters is shown whole", () => {
    // 49,998 characters plus the two quotes JSON adds.
    const text = rolloutTrajectoryText(
      runWithTrace(searchTrace("a".repeat(49_998)))
    );

    assert.notInclude(text, "[renderer truncated");
  });

  it("an observation of 50,001 characters is cut with the renderer's marker", () => {
    const text = rolloutTrajectoryText(
      runWithTrace(searchTrace("a".repeat(49_999)))
    );

    assert.include(
      text,
      "[renderer truncated this observation at 50,000 characters]"
    );
  });

  it("a second user turn is marked where its first step starts", () => {
    const trace = searchTrace("ok");

    const text = rolloutTrajectoryText(
      runWithTrace({
        ...trace,
        steps: [
          ...trace.steps,
          { type: "llm", name: "step 1", output: "Again" },
        ],
      })
    );

    assert.include(
      text,
      "## The next user turn starts\n\n[ACTION] model step 1 wrote: Again"
    );
  });

  it("a run that delivered nothing says so", () => {
    const dir = runWithTrace({ ...searchTrace("ok"), output: "  " });

    assert.strictEqual(rolloutDeliverableText(dir), "(no answer delivered)\n");
  });

  it("a run that recorded no trace has an unavailable trajectory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-rollout-"));

    assert.include(rolloutTrajectoryText(dir), "trajectory unavailable");
  });

  it("a case that crashed before the agent answered is no evidence, though its trace names the case", async () => {
    const dir = runWithTrace({ input: caseId, output: "", steps: [] });
    // The trace is already there, so nothing runs again.
    const view = await executeHarnessRollout(caseId, "base1", undefined, dir);

    assert.isFalse(view.ok);
    assert.include(view.error, "the case recorded no agent steps");
  });
});
