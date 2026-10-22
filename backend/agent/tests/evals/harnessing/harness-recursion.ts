import type { AgentHarnessTree } from "./agent-harness-tree";
import { writeAgentHarnessTree } from "./agent-harness-tree";
import type { HarnessPoolEntry } from "./harness-context";
import { assertHarnessLedgerIdentity } from "./harness-ledger";
import {
  harnessAggregatePrompt,
  harnessComposeRoundPrompt,
  harnessProposePrompt,
} from "./harness-propose-prompts";
import type { HarnessRunView } from "./harness-rollout";
import type { HarnessStage, HarnessTaskRun } from "./harness-stage";
import { harnessDirOf, rollHarnesses, runHarnessStage } from "./harness-stage";

// Task-level recursion, Propose-Probe-Compose (Harness² core/recursion.py).
// Both modes schedule 4k rollouts and 3k stages, the k base rollouts
// included:
//
//   agg (parallel): k INV and k DOM candidates from the base evidence, each
//     rolled once; then k independent aggregators compose agg1..aggk from
//     the base evidence and all 2k candidates, each rolled once.
//   seq (sequential): k rounds; round t proposes inv_t and dom_t on the
//     current checkpoint, rolls them, and composes checkpoint c_t from the
//     whole history, rolled once.

/**
 * A mode's outcome: its stages, trees and rollouts by label, and the
 * finals selection chooses among.
 */
export interface HarnessModeResult {
  readonly mode: "agg" | "seq";
  readonly k: number;
  readonly stages: HarnessStage[];
  readonly trees: Record<string, AgentHarnessTree>;
  readonly rollouts: Record<string, HarnessRunView>;
  readonly finals: string[];
}

const decisionsOf = (stages: readonly HarnessStage[]) =>
  Object.fromEntries(
    stages.map((stage) => [stage.label, stage.notes || stage.error])
  );

const poolOf = (
  task: HarnessTaskRun,
  stages: readonly HarnessStage[],
  rollouts: Readonly<Record<string, HarnessRunView>>
): HarnessPoolEntry[] =>
  stages.map((stage) => ({
    label: stage.label,
    harnessDir: harnessDirOf(task, stage.label),
    rollout: rollouts[stage.label],
  }));

const startMode = (
  task: HarnessTaskRun,
  mode: "agg" | "seq",
  k: number,
  base: readonly HarnessRunView[]
): HarnessModeResult => {
  task.ledger.rollouts.push(...base.map((rollout) => rollout.label));

  return {
    mode,
    k,
    stages: [],
    trees: {},
    rollouts: Object.fromEntries(
      base.map((rollout) => [rollout.label, rollout])
    ),
    finals: [],
  };
};

const keepStages = (
  result: HarnessModeResult,
  stages: readonly HarnessStage[]
) => {
  for (const stage of stages) {
    result.stages.push(stage);
    result.trees[stage.label] = stage.tree;
  }
};

/**
 * WIDTH: 2k candidates from shared evidence, then k independent
 * compositions.
 *
 * @param task - The task's loop.
 * @param k - The width.
 * @param base - The k base rollouts.
 * @returns The mode's outcome.
 */
export const runParallelHarnessing = async (
  task: HarnessTaskRun,
  k: number,
  base: readonly HarnessRunView[]
): Promise<HarnessModeResult> => {
  const result = startMode(task, "agg", k, base);

  const baseDir = writeAgentHarnessTree(
    task.baseTree,
    harnessDirOf(task, "base")
  );

  const specs = Array.from({ length: k }, (_, i) =>
    (["INV", "DOM"] as const).map((dimension) => ({
      label: `${dimension.toLowerCase()}${i + 1}`,
      dimension,
      index: i + 1,
    }))
  ).flat();

  const candidates = await Promise.all(
    specs.map(
      async (spec) =>
        await runHarnessStage(task, {
          label: spec.label,
          dimension: spec.dimension,
          job: harnessProposePrompt(
            task.work,
            spec.dimension,
            task.deferredTools,
            {
              k,
              index: spec.index,
            }
          ),
          fallback: task.baseTree,
          fallbackDir: baseDir,
          rollouts: base,
        })
    )
  );

  keepStages(result, candidates);
  Object.assign(result.rollouts, await rollHarnesses(task, candidates));

  const pool = poolOf(task, candidates, result.rollouts);

  const aggregates = await Promise.all(
    Array.from(
      { length: k },
      async (_, i) =>
        await runHarnessStage(task, {
          label: `agg${i + 1}`,
          dimension: "AGG",
          job: harnessAggregatePrompt(task.work, task.deferredTools, k),
          fallback: task.baseTree,
          fallbackDir: baseDir,
          rollouts: base,
          pool,
          decisions: decisionsOf(candidates),
        })
    )
  );

  keepStages(result, aggregates);
  result.finals.push(...aggregates.map((stage) => stage.label));
  Object.assign(result.rollouts, await rollHarnesses(task, aggregates));
  assertHarnessLedgerIdentity(task.ledger, k);

  return result;
};

/**
 * DEPTH: k nested rounds over the same shared base evidence.
 *
 * @param task - The task's loop.
 * @param k - The depth.
 * @param base - The k base rollouts.
 * @returns The mode's outcome.
 */
export const runSequentialHarnessing = async (
  task: HarnessTaskRun,
  k: number,
  base: readonly HarnessRunView[]
): Promise<HarnessModeResult> => {
  const result = startMode(task, "seq", k, base);

  // Round t edits the checkpoint before it, with the whole history as
  // evidence.
  const runRound = async (
    t: number,
    current: AgentHarnessTree,
    history: readonly HarnessPoolEntry[]
  ): Promise<void> => {
    if (t > k) {
      return;
    }

    const currentDir = writeAgentHarnessTree(
      current,
      harnessDirOf(task, t > 1 ? `c${t - 1}` : "base")
    );

    const candidates = await Promise.all(
      (["INV", "DOM"] as const).map(
        async (dimension) =>
          await runHarnessStage(task, {
            label: `${dimension.toLowerCase()}${t}`,
            dimension,
            job: harnessProposePrompt(
              task.work,
              dimension,
              task.deferredTools,
              {
                k,
                index: t,
                ...(k > 1 && { round: t }),
              }
            ),
            fallback: current,
            fallbackDir: currentDir,
            rollouts: base,
            pool: history,
            decisions: decisionsOf(result.stages),
          })
      )
    );

    keepStages(result, candidates);
    Object.assign(result.rollouts, await rollHarnesses(task, candidates));

    const roundPool = [
      ...history,
      ...poolOf(task, candidates, result.rollouts),
    ];

    const composed = await runHarnessStage(task, {
      label: `c${t}`,
      dimension: "COMPOSE",
      job:
        k === 1
          ? harnessAggregatePrompt(task.work, task.deferredTools, 1)
          : harnessComposeRoundPrompt(task.work, task.deferredTools, t, k),
      fallback: current,
      fallbackDir: currentDir,
      rollouts: base,
      pool: roundPool,
      decisions: decisionsOf(result.stages),
    });

    keepStages(result, [composed]);
    Object.assign(result.rollouts, await rollHarnesses(task, [composed]));

    await runRound(t + 1, composed.tree, [
      ...roundPool,
      ...poolOf(task, [composed], result.rollouts),
    ]);
  };

  await runRound(1, task.baseTree, []);
  result.finals.push(...Array.from({ length: k }, (_, i) => `c${i + 1}`));
  assertHarnessLedgerIdentity(task.ledger, k);

  return result;
};
