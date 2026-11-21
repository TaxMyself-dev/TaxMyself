import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { agentHarnessTreeDiff } from "./agent-harness-tree";
import { assertNoGraderVerdicts } from "./harness-evidence-guard";
import type { HarnessRunView } from "./harness-rollout";
import {
  rolloutDeliverableText,
  rolloutTaskText,
  rolloutTrajectoryText,
} from "./harness-rollout";

// The evidence tree a proposer reads, the only way evidence reaches a model
// (Harness² core/context.py):
//
//   context/task.md                 the user's messages, as the agent got them
//   context/decisions/<label>.md    earlier edits' and compositions' notes
//   context/rollouts/<label>.md     full trajectories
//   context/deliverables/<label>.md each rollout's answer to the user
//   context/harness/                the tree being edited
//   context/pool/<label>/           a candidate's harness, its diff, rollout
//                                   and answer (aggregate and compose only)
//   context/library/                earlier tasks in this area
//
// Evidence is served as files and the prompt is a short pointer (the
// mission), so nothing is truncated to fit a prompt.

/**
 * A candidate in the pool: its label, its harness directory and its
 * rollout.
 */
export interface HarnessPoolEntry {
  readonly label: string;
  readonly harnessDir: string;
  readonly rollout: HarnessRunView | undefined;
}

/**
 * What one evidence tree holds, so the mission names only what exists.
 */
export interface HarnessEvidence {
  readonly root: string;
  readonly rollouts: readonly string[];
  readonly pool: readonly string[];
  readonly decisions: number;
  readonly library: boolean;
}

const writeText = (file: string, text: string) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const hasFiles = (dir: string | null | undefined): dir is string =>
  dir !== undefined &&
  dir !== null &&
  existsSync(dir) &&
  readdirSync(dir).length > 0;

const writePoolEntry = (root: string, entry: HarnessPoolEntry) => {
  const dir = path.join(root, "pool", entry.label);

  cpSync(entry.harnessDir, path.join(dir, "harness"), { recursive: true });
  writeText(
    path.join(dir, "harness.diff"),
    agentHarnessTreeDiff(
      path.join(root, "harness"),
      path.join(dir, "harness")
    ).replaceAll(`${root}/`, "")
  );

  if (entry.rollout !== undefined) {
    writeText(
      path.join(dir, "rollout.md"),
      rolloutTrajectoryText(entry.rollout.runDir)
    );
    writeText(
      path.join(dir, "produced.md"),
      rolloutDeliverableText(entry.rollout.runDir)
    );
  }
};

/**
 * Writes the evidence tree for one stage; a tree that would carry a
 * verdict or the case's name throws HARNESS_GRADER_VERDICT_LEAK.
 *
 * @param root - The tree's directory, replaced.
 * @param input - The case's name (never shown), the base rollouts, the
 *   harness edited, the library, the pool and earlier decisions.
 * @returns What landed.
 */
export const buildHarnessEvidence = (
  root: string,
  input: {
    caseName: string;
    rollouts: readonly HarnessRunView[];
    harnessDir: string;
    libraryDir?: string | null;
    pool?: readonly HarnessPoolEntry[];
    decisions?: Readonly<Record<string, string>>;
  }
): HarnessEvidence => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const first = input.rollouts.find((rollout) => rollout.ok);

  if (first === undefined) {
    throw new Error(
      "HARNESS_NO_TRAJECTORY: no base rollout recorded a trace; the proposer would be adapting on nothing"
    );
  }

  writeText(path.join(root, "task.md"), rolloutTaskText(first.runDir));

  for (const [label, notes] of Object.entries(input.decisions ?? {})) {
    writeText(
      path.join(root, "decisions", `${label}.md`),
      notes.trim() === "" ? "No decision notes returned.\n" : notes
    );
  }

  for (const rollout of input.rollouts) {
    writeText(
      path.join(root, "rollouts", `${rollout.label}.md`),
      rolloutTrajectoryText(rollout.runDir)
    );
    writeText(
      path.join(root, "deliverables", `${rollout.label}.md`),
      rolloutDeliverableText(rollout.runDir)
    );
  }

  cpSync(input.harnessDir, path.join(root, "harness"), { recursive: true });

  for (const entry of input.pool ?? []) {
    writePoolEntry(root, entry);
  }

  const library = hasFiles(input.libraryDir);

  if (hasFiles(input.libraryDir)) {
    cpSync(input.libraryDir, path.join(root, "library"), { recursive: true });
  }

  assertNoGraderVerdicts(root, [input.caseName]);

  return {
    root,
    rollouts: input.rollouts.map((rollout) => rollout.label),
    pool: (input.pool ?? []).map((entry) => entry.label),
    decisions: Object.keys(input.decisions ?? {}).length,
    library,
  };
};

const evidenceLayout = (evidence: HarnessEvidence) => {
  const rolloutFiles = evidence.rollouts.map((label) => `${label}.md`);

  return [
    "context/task.md                  the task as the agent received it",
    ...(evidence.decisions > 0
      ? [
          "context/decisions/              earlier edits and composition decisions",
        ]
      : []),
    `context/rollouts/               FULL trajectories: ${rolloutFiles.join(", ")}`,
    "context/deliverables/<label>.md  the answer each rollout delivered to the user",
    "context/harness/                the harness you are editing",
    ...(evidence.pool.length > 0
      ? [
          `context/pool/                   ${evidence.pool.length} candidates, each with its harness, harness.diff, rollout.md and produced.md`,
        ]
      : []),
    ...(evidence.library
      ? [
          "context/library/                earlier tasks in this area -- browse INDEX.md first, then open what looks relevant",
        ]
      : []),
  ].join("\n");
};

/**
 * The short pointer to the evidence on disk: the job, where the evidence
 * is, and the instruction to open it.
 *
 * @param evidence - What the tree holds.
 * @param job - The stage's prompt.
 * @returns The mission.
 */
export const harnessMission = (evidence: HarnessEvidence, job: string) =>
  [
    job.trim(),
    "",
    "# YOUR EVIDENCE",
    "",
    "It is on disk, in `context/`. Read it -- do not answer from this message alone.",
    "",
    evidenceLayout(evidence),
    "",
    "Every trajectory EVENT is present: the trajectory was not clipped to fit this mission. An individual observation may contain an explicit renderer-truncation marker; that marker is ours, not behavior by the solver. Do not diagnose it as a solver failure.",
    "",
    "Read `task.md` and the current harness first. Inventory every available rollout or candidate and inspect each at least once before deciding. For a candidate, compare what changed from its editing baseline, what behavior changed in its rollout, what improved, and what regressed or remained unresolved. Then deep-read the evidence relevant to any edit. Cite the specific trajectory moment behind every change; one you cannot trace to a moment is speculation.",
  ].join("\n");
