import path from "node:path";

import { Effect } from "effect";

import type { AgentHarnessTree } from "./agent-harness-tree";
import {
  agentHarnessTreeChanges,
  readAgentHarnessTree,
  validateAgentHarnessTree,
  writeAgentHarnessTree,
} from "./agent-harness-tree";
import type { HarnessPoolEntry } from "./harness-context";
import { buildHarnessEvidence, harnessMission } from "./harness-context";
import type { HarnessLedger } from "./harness-ledger";
import type { HarnessWork } from "./harness-prompt-rules";
import { callHarnessProposer } from "./harness-proposer";
import type { HarnessRunView } from "./harness-rollout";
import { executeHarnessRollout } from "./harness-rollout";

// One improvement stage and one rollout of agent harnessing (Harness²
// core/recursion.py, _run_stage and _roll): a stage builds its evidence,
// asks the proposer for an edited tree, validates it, and retries an
// invalid proposal once with the rejection; a stage that still fails falls
// back to the harness it was editing. A rollout writes a tree and runs the
// case under it; a dead rollout is recorded, never thrown.

const stageAttempts = 2;
const notesPattern = /<notes>(?<notes>[\s\S]*?)<\/notes>/u;

/**
 * Everything one task's loop shares: the case, the work's text, where it
 * writes, the ledger and the library.
 */
export interface HarnessTaskRun {
  readonly caseId: string;
  readonly caseName: string;
  readonly work: HarnessWork;
  readonly deferredTools: readonly string[];
  readonly workDir: string;
  readonly ledger: HarnessLedger;
  readonly libraryDir: string | null;
  readonly baseTree: AgentHarnessTree;
  readonly rolloutWidth: number;
}

const harnessStageDimensions = ["INV", "DOM", "AGG", "COMPOSE"] as const;

/**
 * What a stage authors: an INV or DOM candidate, an aggregate, or a
 * sequential checkpoint.
 */
export type HarnessStageDimension = (typeof harnessStageDimensions)[number];

/**
 * A finished stage: its tree, whether it kept the harness it edited or
 * fell back to it, its notes and its spend.
 */
export interface HarnessStage {
  readonly label: string;
  readonly dimension: HarnessStageDimension;
  readonly tree: AgentHarnessTree;
  readonly keptBase: boolean;
  readonly fellBack: boolean;
  readonly error: string;
  readonly usd: number;
  readonly attempts: number;
  readonly notes: string;
}

/**
 * A tree's directory under the task's work directory.
 *
 * @param task - The task's loop.
 * @param label - The tree's label.
 * @returns The directory.
 */
export const harnessDirOf = (task: HarnessTaskRun, label: string) =>
  path.join(task.workDir, "harnesses", label);

const harvestedTree = async (
  workspace: string | null
): Promise<{ tree: AgentHarnessTree; error: string }> => {
  if (workspace === null) {
    return {
      tree: {},
      error:
        "the harness directory did not come back from the session; edit the files in `context/harness/` in place",
    };
  }

  const rejected: string[] = [];
  const tree = readAgentHarnessTree(workspace, rejected);

  if (Object.keys(tree).length === 0) {
    return {
      tree,
      error:
        "`context/harness/` came back empty -- edit the files, do not delete them all",
    };
  }

  if (rejected.length > 0) {
    return {
      tree,
      error: `these files are off the editable surface and were not applied: ${rejected.toSorted().slice(0, 6).join(", ")}. Only \`instructions.md\` and \`tools/<tool name>.md\` exist.`,
    };
  }

  try {
    await validateAgentHarnessTree(tree);
  } catch (error) {
    return { tree, error: String(error) };
  }

  return { tree, error: "" };
};

/**
 * Runs one stage: evidence, proposal, validation, one retry, fallback.
 *
 * @param task - The task's loop.
 * @param stage - The stage's label, dimension and job, the tree it edits
 *   (its fallback), the base rollouts, the pool and earlier decisions.
 * @returns The stage.
 */
export const runHarnessStage = async (
  task: HarnessTaskRun,
  stage: {
    label: string;
    dimension: HarnessStage["dimension"];
    job: string;
    fallback: AgentHarnessTree;
    fallbackDir: string;
    rollouts: readonly HarnessRunView[];
    pool?: readonly HarnessPoolEntry[];
    decisions?: Readonly<Record<string, string>>;
  }
): Promise<HarnessStage> => {
  const contextDir = path.join(task.workDir, "context", stage.label);
  const spent = { usd: 0, attempts: 0 };

  const ended = (
    tree: AgentHarnessTree,
    outcome: { error: string; notes: string }
  ): HarnessStage => {
    const changes = agentHarnessTreeChanges(stage.fallback, tree);

    task.ledger.sessions.push({ label: stage.label, ...spent });

    return {
      label: stage.label,
      dimension: stage.dimension,
      tree,
      keptBase:
        outcome.error === "" &&
        changes.added.length +
          changes.removed.length +
          changes.modified.length ===
          0,
      fellBack: outcome.error !== "",
      error: outcome.error.slice(0, 400),
      usd: spent.usd,
      attempts: spent.attempts,
      notes: outcome.notes,
    };
  };

  // One proposal; an invalid one is retried once with its rejection, then
  // the stage falls back to the tree it was editing.
  const propose = async (
    mission: string,
    attempt: number,
    rejection: string
  ): Promise<HarnessStage> => {
    const reply = await callHarnessProposer({
      mission:
        rejection === ""
          ? mission
          : `${mission}\n\n# YOUR PREVIOUS ATTEMPT WAS REJECTED\n\n${rejection}\n\nFix it in \`context/harness/\` and reply again.`,
      contextDir,
      label: `${stage.label}.a${attempt}`,
      harvest: true,
      auditRoot: path.join(task.workDir, "proposer"),
      ledger: task.ledger,
    });

    spent.usd += reply.costUsd;
    spent.attempts += Math.max(1, reply.attempts);

    if (reply.failure !== "") {
      return ended(stage.fallback, { error: reply.failure, notes: "" });
    }

    const proposed = await harvestedTree(reply.workspace);

    if (proposed.error === "") {
      return ended(proposed.tree, {
        error: "",
        notes:
          notesPattern.exec(reply.text)?.groups?.notes?.trim() ??
          reply.text.trim(),
      });
    }

    if (attempt >= stageAttempts) {
      return ended(stage.fallback, { error: proposed.error, notes: "" });
    }

    // The retry sees its own rejected tree and fixes it.
    writeAgentHarnessTree(proposed.tree, path.join(contextDir, "harness"));

    return await propose(mission, attempt + 1, proposed.error);
  };

  let mission: string;

  try {
    mission = harnessMission(
      buildHarnessEvidence(contextDir, {
        caseName: task.caseName,
        rollouts: stage.rollouts,
        harnessDir: stage.fallbackDir,
        libraryDir: task.libraryDir,
        pool: stage.pool,
        decisions: stage.decisions,
      }),
      stage.job
    );
  } catch (error) {
    return ended(stage.fallback, {
      error: `could not build evidence: ${String(error)}`,
      notes: "",
    });
  }

  return await propose(mission, 1, "");
};

/**
 * Writes each tree and rolls the case under it, a few at a time, then
 * records them in the ledger in the given order (Harness² _roll_many), so a
 * concurrent run records the same sequence as a serial one.
 *
 * @param task - The task's loop.
 * @param items - Each rollout's label and tree.
 * @returns Each rollout by label.
 */
export const rollHarnesses = async (
  task: HarnessTaskRun,
  items: readonly { label: string; tree: AgentHarnessTree }[]
): Promise<Record<string, HarnessRunView>> => {
  const views = await Effect.runPromise(
    Effect.all(
      items.map((item) =>
        Effect.promise(
          async () =>
            await executeHarnessRollout(
              task.caseId,
              item.label,
              writeAgentHarnessTree(item.tree, harnessDirOf(task, item.label)),
              path.join(task.workDir, "runs", item.label)
            )
        )
      ),
      { concurrency: task.rolloutWidth }
    )
  );

  for (const { label } of items) {
    task.ledger.rollouts.push(label);
  }

  return Object.fromEntries(views.map((view) => [view.label, view]));
};
