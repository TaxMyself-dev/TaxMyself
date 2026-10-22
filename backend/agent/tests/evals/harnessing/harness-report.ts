import { writeFileSync } from "node:fs";
import path from "node:path";

import { Effect } from "effect";

import type { AgentHarnessTree } from "./agent-harness-tree";
import {
  agentHarnessTreeChanges,
  agentHarnessTreeDiff,
  writeAgentHarnessTree,
} from "./agent-harness-tree";
import { harnessRolloutPassed } from "./harness-judge";
import type { HarnessBudget } from "./harness-ledger";
import type { HarnessExperience } from "./harness-library";
import type { HarnessModeResult } from "./harness-recursion";
import type { HarnessRunView } from "./harness-rollout";
import { executeHarnessRollout } from "./harness-rollout";
import type { HarnessSelection } from "./harness-selection";
import type { HarnessTaskRun } from "./harness-stage";
import { harnessDirOf } from "./harness-stage";

// The before/after of agent harnessing, run only after selection has
// committed for every task (Harness² core/judge.py and core/report.py):
// each case reruns --reps times under the base harness and under the
// adopted one, and report.md puts the verdicts, the spend, every stage's
// notes and each case's adopted.diff in front of the person who decides
// whether to adopt it into the code.

/**
 * One task's loop, as the report reads it.
 */
export interface HarnessTaskOutcome {
  readonly caseId: string;
  readonly area: string;
  readonly task: HarnessTaskRun;
  readonly result: HarnessModeResult;
  readonly selection: HarnessSelection;
  readonly experience: HarnessExperience | null;
  readonly adopted: AgentHarnessTree | undefined;
}

/**
 * One case's before/after: each rerun's verdict under the base and the
 * adopted harness (undefined when the case reached no verdict).
 */
export interface HarnessCaseBenchmark {
  readonly caseId: string;
  readonly base: (boolean | undefined)[];
  readonly adopted: (boolean | undefined)[];
  readonly changed: boolean;
}

const isChanged = (outcome: HarnessTaskOutcome) => {
  if (outcome.adopted === undefined) {
    return false;
  }

  const changes = agentHarnessTreeChanges(
    outcome.task.baseTree,
    outcome.adopted
  );

  return (
    changes.added.length + changes.removed.length + changes.modified.length > 0
  );
};

type HarnessBenchSide = "base" | "adopted";

const benchRollout = async (
  outcome: HarnessTaskOutcome,
  side: HarnessBenchSide,
  rep: number
) => {
  const label = `bench-${side}-${rep}`;

  const view = await executeHarnessRollout(
    outcome.caseId,
    label,
    side === "base" ? undefined : harnessDirOf(outcome.task, "adopted"),
    path.join(outcome.task.workDir, "runs", label)
  );

  return { caseId: outcome.caseId, side, passed: harnessRolloutPassed(view) };
};

/**
 * Reruns each case under the base and the adopted harness and reads the
 * verdicts. A case whose adopted harness equals the base reruns only the
 * base.
 *
 * @param outcomes - Every task's loop.
 * @param options - The reps and how many rollouts run at once.
 * @returns Each case's before/after.
 */
export const benchmarkHarnessTasks = async (
  outcomes: readonly HarnessTaskOutcome[],
  options: { reps: number; width: number }
): Promise<HarnessCaseBenchmark[]> => {
  const reps = Array.from({ length: options.reps }, (_, rep) => rep + 1);

  const jobs = outcomes.flatMap((outcome) => {
    const sides: HarnessBenchSide[] = ["base"];

    if (isChanged(outcome) && outcome.adopted !== undefined) {
      writeAgentHarnessTree(
        outcome.adopted,
        harnessDirOf(outcome.task, "adopted")
      );
      sides.push("adopted");
    }

    return sides.flatMap((side) => reps.map((rep) => ({ outcome, side, rep })));
  });

  const runs = await Effect.runPromise(
    Effect.all(
      jobs.map(({ outcome, side, rep }) =>
        Effect.promise(async () => await benchRollout(outcome, side, rep))
      ),
      { concurrency: options.width }
    )
  );

  return outcomes.map((outcome) => {
    const verdicts = (side: HarnessBenchSide) =>
      runs.flatMap((run) =>
        run.caseId === outcome.caseId && run.side === side ? [run.passed] : []
      );

    return {
      caseId: outcome.caseId,
      base: verdicts("base"),
      adopted: verdicts("adopted"),
      changed: isChanged(outcome),
    };
  });
};

const passCount = (verdicts: readonly (boolean | undefined)[]) => {
  const passed = verdicts.filter((verdict) => verdict === true).length;
  const unknown = verdicts.filter((verdict) => verdict === undefined).length;
  const note = unknown === 0 ? "" : ` (${unknown} without a verdict)`;

  return `${passed}/${verdicts.length}${note}`;
};

const verdictWords = new Map<boolean | undefined, string>([
  [true, "pass"],
  [false, "fail"],
  [undefined, "no verdict"],
]);

const loopVerdicts = (rollouts: Readonly<Record<string, HarnessRunView>>) =>
  Object.values(rollouts)
    .map(
      (rollout) =>
        `${rollout.label} ${verdictWords.get(harnessRolloutPassed(rollout)) ?? "no verdict"}`
    )
    .join(", ");

const sessionSpend = (session: { label: string; usd: number }) =>
  `${session.label} $${session.usd.toFixed(2)}`;

const lessonLine = (experience: HarnessExperience | null) =>
  experience === null
    ? "NO_ENTRY"
    : `${experience.cue} -> ${experience.lesson} (${experience.confidence})`;

const taskSection = (
  outcome: HarnessTaskOutcome,
  bench: HarnessCaseBenchmark | undefined
) => {
  const { result, selection, task } = outcome;
  const diffFile = path.join(task.workDir, "adopted.diff");
  const changed = bench?.changed === true;
  const sameNote = changed ? "" : " (same as the base harness)";
  const selectionNote = selection.error === "" ? "" : `; ${selection.error}`;

  const fellBack = result.stages.flatMap((stage) =>
    stage.fellBack ? [`${stage.label} (${stage.error})`] : []
  );

  writeFileSync(
    diffFile,
    changed
      ? agentHarnessTreeDiff(
          harnessDirOf(task, "base"),
          harnessDirOf(task, "adopted")
        )
      : ""
  );

  return [
    `## ${outcome.caseId}`,
    "",
    `- area: ${outcome.area}; adopted: ${selection.label ?? "nothing"}${sameNote}${selectionNote}`,
    `- before (base harness): ${bench === undefined ? "not run" : passCount(bench.base)}`,
    `- after (adopted harness): ${changed ? passCount(bench.adopted) : "same harness as before"}`,
    `- the loop's own rollouts: ${loopVerdicts(result.rollouts)}`,
    `- proposer: ${task.ledger.sessions.map(sessionSpend).join(", ")}`,
    `- fell back: ${fellBack.join("; ") || "none"}`,
    `- diff: \`${path.relative(process.cwd(), diffFile)}\``,
    `- lesson: ${lessonLine(outcome.experience)}`,
    "",
    "### Stage notes",
    "",
    ...result.stages.flatMap((stage) => [
      `#### ${stage.label} (${stage.dimension}${stage.keptBase ? ", KEEP_BASE" : ""})`,
      "",
      stage.notes || stage.error || "(none)",
      "",
    ]),
  ].join("\n");
};

/**
 * Writes report.md: the before/after per case, the spend, and each stage's
 * notes, with each case's adopted.diff beside its loop.
 *
 * @param runRoot - The run's directory.
 * @param outcomes - Every task's loop.
 * @param benchmark - Each case's before/after.
 * @param run - The run's mode, k, reps and budget.
 */
export const writeHarnessReport = (
  runRoot: string,
  outcomes: readonly HarnessTaskOutcome[],
  benchmark: readonly HarnessCaseBenchmark[],
  run: { mode: string; k: number; reps: number; budget: HarnessBudget }
) => {
  const total = (side: "base" | "adopted") =>
    passCount(
      benchmark.flatMap((bench) =>
        side === "adopted" && !bench.changed ? bench.base : bench[side]
      )
    );

  writeFileSync(
    path.join(runRoot, "report.md"),
    [
      "# Agent harnessing report",
      "",
      `Mode ${run.mode}, k=${run.k}; ${outcomes.length} cases; each judged ${run.reps} times per harness after selection. Proposer (Claude Code CLI) spend: $${run.budget.spentUsd.toFixed(2)} of $${run.budget.capUsd.toFixed(2)}.`,
      "",
      `- before, all cases: ${total("base")}`,
      `- after, all cases: ${total("adopted")}`,
      "",
      "Nothing here is adopted into the code. Each adopted.diff is a candidate change to the instructions or tool descriptions, for approval.",
      "",
      ...outcomes.map((outcome) =>
        taskSection(
          outcome,
          benchmark.find((bench) => bench.caseId === outcome.caseId)
        )
      ),
    ].join("\n")
  );
};
