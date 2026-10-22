import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import { writeAgentHarnessTree } from "./agent-harness-tree";
import { buildHarnessEvidence, harnessMission } from "./harness-context";
import type { HarnessRunView } from "./harness-rollout";

// The evidence tree a proposer reads: what lands in it, what the mission
// names, and the tripwire that refuses a verdict or the case's name.

const caseName = "finds rentals in the user's city";

const scratchDir = () => mkdtempSync(path.join(tmpdir(), "harness-context-"));

const rollout = (label: string, output: string): HarnessRunView => {
  const runDir = scratchDir();

  writeFileSync(
    path.join(runDir, "traces.jsonl"),
    `${JSON.stringify({
      case_id: `agent/x.eval.ts > x > ${caseName}`,
      input: "Find me an accountant",
      output,
      error: null,
      steps: [{ type: "llm", name: "step 1", output }],
    })}\n`
  );

  return { label, runDir, ok: true, delivered: true, error: "" };
};

const harnessDir = () =>
  writeAgentHarnessTree({ "instructions.md": "be useful" }, scratchDir());

describe("harness context", () => {
  it("the tree holds the task, each rollout and its answer, and the harness", () => {
    const root = path.join(scratchDir(), "context");

    const evidence = buildHarnessEvidence(root, {
      caseName,
      rollouts: [rollout("base1", "I found")],
      harnessDir: harnessDir(),
    });

    assert.include(
      readFileSync(path.join(root, "task.md"), "utf-8"),
      "Find me an accountant"
    );
    assert.include(
      readFileSync(path.join(root, "rollouts/base1.md"), "utf-8"),
      "[ACTION] model step 1 wrote: I found"
    );
    assert.strictEqual(
      readFileSync(path.join(root, "deliverables/base1.md"), "utf-8"),
      "I found\n"
    );
    assert.isTrue(existsSync(path.join(root, "harness/instructions.md")));
    assert.deepStrictEqual(evidence.pool, []);
    assert.isFalse(evidence.library);
  });

  it("a pool candidate brings its harness, its diff, rollout and answer", () => {
    const root = path.join(scratchDir(), "context");

    const candidate = writeAgentHarnessTree(
      { "instructions.md": "be brief" },
      scratchDir()
    );

    buildHarnessEvidence(root, {
      caseName,
      rollouts: [rollout("base1", "I found")],
      harnessDir: harnessDir(),
      pool: [
        {
          label: "inv1",
          harnessDir: candidate,
          rollout: rollout("inv1", "Yes"),
        },
      ],
    });

    const diff = readFileSync(
      path.join(root, "pool/inv1/harness.diff"),
      "utf-8"
    );

    assert.include(diff, "-be useful");
    assert.include(diff, "+be brief");
    assert.notInclude(diff, root);
    assert.strictEqual(
      readFileSync(path.join(root, "pool/inv1/produced.md"), "utf-8"),
      "Yes\n"
    );
  });

  it("the mission names only what the tree holds", () => {
    const root = path.join(scratchDir(), "context");

    const mission = harnessMission(
      buildHarnessEvidence(root, {
        caseName,
        rollouts: [rollout("base1", "I found")],
        harnessDir: harnessDir(),
      }),
      "THE JOB"
    );

    assert.isTrue(mission.startsWith("THE JOB"));
    assert.include(mission, "FULL trajectories: base1.md");
    assert.notInclude(mission, "context/pool/");
    assert.notInclude(mission, "context/library/");
  });

  it("a trajectory that carries the case's name is refused", () => {
    assert.throws(() => {
      buildHarnessEvidence(path.join(scratchDir(), "context"), {
        caseName,
        rollouts: [rollout("base1", `I ${caseName}`)],
        harnessDir: harnessDir(),
      });
    }, /HARNESS_GRADER_VERDICT_LEAK/u);
  });

  it("a trajectory that carries a verdict is refused", () => {
    assert.throws(() => {
      buildHarnessEvidence(path.join(scratchDir(), "context"), {
        caseName,
        rollouts: [rollout("base1", '{"passed_all": true}')],
        harnessDir: harnessDir(),
      });
    }, /HARNESS_GRADER_VERDICT_LEAK/u);
  });

  it("no evidence is built when no base rollout recorded a trace", () => {
    const dead: HarnessRunView = {
      label: "base1",
      runDir: scratchDir(),
      ok: false,
      delivered: false,
      error: "the case recorded no trace",
    };

    assert.throws(() => {
      buildHarnessEvidence(path.join(scratchDir(), "context"), {
        caseName,
        rollouts: [dead],
        harnessDir: harnessDir(),
      });
    }, /HARNESS_NO_TRAJECTORY/u);
  });
});
