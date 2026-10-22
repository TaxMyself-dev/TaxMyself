import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Effect } from "effect";

import { agentToolNamespaceName } from "@/agent/core/tool-runtime/agent-tool-search";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";

import {
  evalResultRowSchema,
  evalShortHash,
  readEvalJsonLines,
} from "../runner/eval-run-records";
import { baseAgentHarnessTree } from "./agent-harness-tree";
import { appHarnessWork } from "./agent-harness-work";
import type { HarnessBudget } from "./harness-ledger";
import { createHarnessLedger, writeHarnessLedger } from "./harness-ledger";
import { addHarnessLibraryEntry, harnessLibraryDir } from "./harness-library";
import type { HarnessModeResult } from "./harness-recursion";
import {
  runParallelHarnessing,
  runSequentialHarnessing,
} from "./harness-recursion";
import type { HarnessTaskOutcome } from "./harness-report";
import { benchmarkHarnessTasks, writeHarnessReport } from "./harness-report";
import { executeHarnessRollout } from "./harness-rollout";
import {
  reflectHarnessAdoption,
  selectHarnessFinal,
} from "./harness-selection";
import type { HarnessTaskRun } from "./harness-stage";

// Agent harnessing, on demand only (npm run harness), after Harness² (arXiv
// 2610.14224): for each eval case that failed in an earlier run, adapt the
// agent's harness (its instructions and tool descriptions) by
// Propose-Probe-Compose, select a final blind, reflect into the area's
// library, and only then judge: the base and the adopted harness each
// rerun --reps times. Nothing is adopted into the code: report.md and each
// case's adopted.diff wait for a person's approval.
//
//   npm run harness -- --from bench-luna --budget 10
//   npm run harness -- --case "agent/x.eval.ts > d > t" --k 2 --mode seq
//
// The proposer is Claude Code's CLI (harness-proposer.ts), capped at
// --budget dollars across the run; the agent and the judges run as in
// npm run eval. A run resumes: finished rollouts and proposer sessions are
// reused from .eval/agent/harnessing/<tag>/.

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const evalRoot = path.join(projectRoot, ".eval/agent");

const flagValues = (name: string) =>
  process.argv.flatMap((arg, i) =>
    arg === name ? [process.argv[i + 1] ?? ""] : []
  );

const flag = (name: string) => flagValues(name).at(0);

const k = Number(flag("--k") ?? "1");
const mode = flag("--mode") ?? "agg";
const reps = Number(flag("--reps") ?? "3");
const width = Number(flag("--width") ?? "2");
const tag = flag("--tag") ?? new Date().toISOString().slice(0, 10);

const budget: HarnessBudget = {
  capUsd: Number(flag("--budget") ?? "10"),
  spentUsd: 0,
};

const runRoot = path.join(evalRoot, "harnessing", tag);

// The cases to adapt: those named, or every case that failed in --from.
const failingCases = () => {
  const named = flagValues("--case");

  if (named.length > 0) {
    return named;
  }

  const from = flag("--from") ?? "bench-luna";

  const rows = readEvalJsonLines(
    path.join(evalRoot, "runs", from, "results.jsonl"),
    evalResultRowSchema
  );

  return [
    ...new Set(rows.filter((row) => !row.passed_all).map((row) => row.case_id)),
  ];
};

const deferredTools = Object.keys(appAgentTools).filter(
  (name) => agentToolNamespaceName(name) !== undefined
);

// "agent/searches/x.eval.ts > ..." -> "searches".
const caseArea = (caseId: string) =>
  caseId.split(" > ")[0]?.split("/").at(-2) ?? "unknown";

const runHarnessMode = async (
  task: HarnessTaskRun,
  base: Parameters<typeof runParallelHarnessing>[2]
): Promise<HarnessModeResult> =>
  mode === "seq"
    ? await runSequentialHarnessing(task, k, base)
    : await runParallelHarnessing(task, k, base);

const harnessOneTask = async (caseId: string): Promise<HarnessTaskOutcome> => {
  const area = caseArea(caseId);

  const libraryDir = harnessLibraryDir(
    path.join(runRoot, "library", mode),
    area
  );

  const task: HarnessTaskRun = {
    caseId,
    caseName: caseId.split(" > ").at(-1) ?? caseId,
    work: appHarnessWork,
    deferredTools,
    workDir: path.join(runRoot, "tasks", `task-${evalShortHash(caseId)}`),
    ledger: createHarnessLedger(budget),
    libraryDir: existsSync(path.join(libraryDir, "harnesses"))
      ? libraryDir
      : null,
    baseTree: baseAgentHarnessTree(),
    rolloutWidth: width,
  };

  console.log(`\n[harness] ${caseId}`);

  const base = await Promise.all(
    Array.from(
      { length: k },
      async (_, i) =>
        await executeHarnessRollout(
          caseId,
          `base${i + 1}`,
          undefined,
          path.join(task.workDir, "runs", `base${i + 1}`)
        )
    )
  );

  const result = await runHarnessMode(task, base);
  const selection = await selectHarnessFinal(task, result);
  const experience = await reflectHarnessAdoption(task, result, selection);

  const adopted =
    selection.label === null ? undefined : result.trees[selection.label];

  if (adopted !== undefined && selection.label !== null) {
    addHarnessLibraryEntry(libraryDir, area, {
      caseId,
      label: selection.label,
      why: selection.why,
      tree: adopted,
      experience,
    });
  }

  writeHarnessLedger(task.ledger, path.join(task.workDir, "ledger.json"));
  writeFileSync(
    path.join(task.workDir, "mode.json"),
    `${JSON.stringify(
      {
        mode: result.mode,
        k: result.k,
        finals: result.finals,
        selection,
        stages: result.stages.map(({ tree: _tree, ...stage }) => stage),
      },
      null,
      2
    )}\n`
  );
  console.log(
    `[harness] adopted ${selection.label ?? "nothing"}; proposer spend so far $${budget.spentUsd.toFixed(2)}`
  );

  return { caseId, area, task, result, selection, experience, adopted };
};

const runAgentHarnessing = async () => {
  if (mode !== "agg" && mode !== "seq") {
    throw new Error(`HARNESS_MODE_UNKNOWN: --mode is agg or seq, not ${mode}`);
  }

  mkdirSync(runRoot, { recursive: true });
  const cases = failingCases();

  console.log(
    `[harness] ${cases.length} cases, mode ${mode}, k=${k}, proposer cap $${budget.capUsd}`
  );
  let budgetSpent = false;

  // One task at a time, in a stable order: each area's library grows from
  // the tasks before it. A task that fails is reported and skipped; once
  // the budget is spent no task starts.
  const settled = await Effect.runPromise(
    Effect.all(
      cases.map((caseId) =>
        Effect.promise(async () => {
          if (budgetSpent) {
            return [];
          }

          try {
            return [await harnessOneTask(caseId)];
          } catch (error) {
            console.error(`[harness] ${caseId} stopped: ${String(error)}`);
            budgetSpent = String(error).includes("HARNESS_BUDGET_SPENT");

            return [];
          }
        })
      ),
      { concurrency: 1 }
    )
  );

  const outcomes = settled.flat();

  // Selection has committed for every task; only now does anything read
  // a verdict.
  const benchmark = await benchmarkHarnessTasks(outcomes, { reps, width });

  writeHarnessReport(runRoot, outcomes, benchmark, {
    mode,
    k,
    reps,
    budget,
  });
  console.log(`[harness] report: ${path.join(runRoot, "report.md")}`);
};

await runAgentHarnessing();
