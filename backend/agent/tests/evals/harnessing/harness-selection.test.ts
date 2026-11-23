import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import { baseAgentHarnessTree } from "./agent-harness-tree";
import { appHarnessWork } from "./agent-harness-work";
import { createHarnessLedger } from "./harness-ledger";
import type { HarnessModeResult } from "./harness-recursion";
import type { HarnessRunView } from "./harness-rollout";
import {
  parseHarnessExperience,
  selectHarnessFinal,
} from "./harness-selection";
import type { HarnessTaskRun } from "./harness-stage";

// Selection at k=1 needs no session (the single final that delivered is
// adopted, one that delivered nothing is not), and reflection's reply is
// read into edit rows and at most one lesson.

const task: HarnessTaskRun = {
  caseId: "agent/x.eval.ts > x > y",
  caseName: "y",
  work: appHarnessWork,
  deferredTools: [],
  workDir: mkdtempSync(path.join(tmpdir(), "harness-selection-")),
  ledger: createHarnessLedger({ capUsd: 1, spentUsd: 0 }),
  libraryDir: null,
  baseTree: baseAgentHarnessTree(),
  rolloutWidth: 1,
};

const view = (label: string, delivered: boolean): HarnessRunView => ({
  label,
  runDir: "",
  ok: true,
  delivered,
  error: "",
});

const modeWith = (agg1: HarnessRunView): HarnessModeResult => ({
  mode: "agg",
  k: 1,
  stages: [],
  trees: {},
  rollouts: { base1: view("base1", true), agg1 },
  finals: ["agg1"],
});

describe("harness selection", () => {
  it("the single final at k=1 is adopted without a session", async () => {
    const selection = await selectHarnessFinal(
      task,
      modeWith(view("agg1", true))
    );

    assert.deepStrictEqual(selection, {
      label: "agg1",
      why: "trivial pool: single final at k=1; delivered without a selector session",
      trivial: true,
      error: "",
    });
    assert.strictEqual(task.ledger.budget.spentUsd, 0);
  });

  it("a final that delivered no answer is never adopted, and the base is not a fallback", async () => {
    const selection = await selectHarnessFinal(
      task,
      modeWith(view("agg1", false))
    );

    assert.isNull(selection.label);
    assert.strictEqual(selection.error, "no final delivered an answer");
  });

  it("a reflection's lesson and edit rows are read", () => {
    assert.deepStrictEqual(
      parseHarnessExperience(
        "<edits>\ncomponent: tools/searchWeb.md\nverdict: helped\n</edits>\n<experience>\ncue: a web request\nlesson: tools/searchWeb.md: search both\nevidence: inv1 helped\nconfidence: low\n</experience>"
      ),
      {
        cue: "a web request",
        lesson: "tools/searchWeb.md: search both",
        evidence: "inv1 helped",
        confidence: "low",
        edits: "component: tools/searchWeb.md\nverdict: helped",
      }
    );
  });

  it("NO_ENTRY, or a lesson without its evidence, is no lesson", () => {
    assert.isNull(parseHarnessExperience("<edits>x</edits>\nNO_ENTRY"));
    assert.isNull(
      parseHarnessExperience(
        "<experience>\ncue: a web request\nlesson: search both\n</experience>"
      )
    );
  });
});
