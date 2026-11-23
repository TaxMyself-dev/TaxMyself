import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { evalShortHash } from "../runner/eval-run-records";
import { writeAgentHarnessTree } from "./agent-harness-tree";
import { buildHarnessEvidence, harnessMission } from "./harness-context";
import { assertNoGraderVerdicts } from "./harness-evidence-guard";
import type { HarnessExperience } from "./harness-library";
import { callHarnessProposer } from "./harness-proposer";
import type { HarnessModeResult } from "./harness-recursion";
import {
  harnessExperiencePrompt,
  harnessSelectPrompt,
} from "./harness-reflect-prompts";
import {
  rolloutDeliverableText,
  rolloutTaskText,
  rolloutTrajectoryText,
} from "./harness-rollout";
import type { HarnessTaskRun } from "./harness-stage";
import { harnessDirOf } from "./harness-stage";

// Selection and reflection (Harness² core/selection.py). Selection
// delivers one of the mode's finals with the harnesses hidden: the single
// final at k=1 without a session, otherwise a blind session over anonymous,
// shuffled answers. A final whose rollout delivered nothing is dropped.
// Reflection then reads the whole round and writes the edit rows and at
// most one transferable lesson for the library.

const choicePattern = /```choice\s+(?<id>[\w-]+)\s+```/u;
const whyPattern = /<why>(?<why>[\s\S]*?)<\/why>/u;
const editsPattern = /<edits>(?<edits>[\s\S]*?)<\/edits>/u;
const experiencePattern = /<experience>(?<body>[\s\S]*?)<\/experience>/u;

/**
 * The delivered final: its label and why, or an error when no final
 * delivered an answer.
 */
export interface HarnessSelection {
  readonly label: string | null;
  readonly why: string;
  readonly trivial: boolean;
  readonly error: string;
}

const anonymousId = (index: number) => String.fromCodePoint(65 + index);

const candidateText = (runDir: string) =>
  [
    "# The answer",
    "",
    rolloutDeliverableText(runDir),
    "# The tool results it was written from",
    "",
    rolloutTrajectoryText(runDir)
      .split("\n")
      .filter((line) => line.startsWith("[OBSERVATION]"))
      .join("\n\n"),
  ].join("\n");

/**
 * Delivers one final of the mode.
 *
 * @param task - The task's loop.
 * @param result - The mode's outcome.
 * @returns The selection.
 */
export const selectHarnessFinal = async (
  task: HarnessTaskRun,
  result: HarnessModeResult
): Promise<HarnessSelection> => {
  const delivered = result.finals.filter(
    (label) => result.rollouts[label]?.delivered
  );

  if (delivered.length === 0) {
    return {
      label: null,
      why: "",
      trivial: result.k === 1,
      error: "no final delivered an answer",
    };
  }

  if (delivered.length === 1 && result.k === 1) {
    return {
      label: delivered[0] ?? null,
      why: "trivial pool: single final at k=1; delivered without a selector session",
      trivial: true,
      error: "",
    };
  }

  // Shuffled by a hash of the case and label, so a rerun shows the same ids.
  const shuffled = delivered.toSorted((a, b) =>
    evalShortHash(`${task.caseId}:${a}`).localeCompare(
      evalShortHash(`${task.caseId}:${b}`)
    )
  );

  const ids = new Map(shuffled.map((label, i) => [anonymousId(i), label]));

  const root = path.join(
    task.workDir,
    "selection",
    `${result.mode}${result.k}`
  );

  rmSync(root, { recursive: true, force: true });
  mkdirSync(path.join(root, "candidates"), { recursive: true });
  const firstRun = result.rollouts[shuffled[0] ?? ""]?.runDir ?? "";

  writeFileSync(path.join(root, "task.md"), rolloutTaskText(firstRun));

  for (const [id, label] of ids) {
    writeFileSync(
      path.join(root, "candidates", `${id}.md`),
      candidateText(result.rollouts[label]?.runDir ?? "")
    );
  }

  assertNoGraderVerdicts(root, [task.caseName]);

  const reply = await callHarnessProposer({
    mission: harnessSelectPrompt(task.work, ids.size),
    contextDir: root,
    label: `select.${result.mode}${result.k}`,
    harvest: false,
    auditRoot: path.join(task.workDir, "proposer"),
    ledger: task.ledger,
  });

  const chosen = ids.get(choicePattern.exec(reply.text)?.groups?.id ?? "");

  return chosen === undefined
    ? {
        label: shuffled[0] ?? null,
        why: "",
        trivial: false,
        error: `no valid choice in the selector's reply; delivered the first candidate. ${reply.failure}`,
      }
    : {
        label: chosen,
        why: whyPattern.exec(reply.text)?.groups?.why?.trim() ?? "",
        trivial: false,
        error: "",
      };
};

/**
 * The edit rows and the lesson from a reflection's reply; null for
 * NO_ENTRY or a lesson missing its cue, lesson or evidence.
 *
 * @param text - The reply.
 * @returns The experience.
 */
export const parseHarnessExperience = (
  text: string
): HarnessExperience | null => {
  const body = experiencePattern.exec(text)?.groups?.body ?? "";

  const fields = new Map(
    body
      .trim()
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const at = line.indexOf(":");

        return [
          line.slice(0, at).trim().toLowerCase(),
          line.slice(at + 1).trim(),
        ];
      })
  );

  const cue = fields.get("cue") ?? "";
  const lesson = fields.get("lesson") ?? "";
  const evidence = fields.get("evidence") ?? "";

  return cue === "" || lesson === "" || evidence === ""
    ? null
    : {
        cue,
        lesson,
        evidence,
        confidence: fields.get("confidence") ?? "",
        edits: editsPattern.exec(text)?.groups?.edits?.trim() ?? "",
      };
};

/**
 * Learns from the round after adoption: the edit rows and the one lesson,
 * or null (NO_ENTRY, or the session failed).
 *
 * @param task - The task's loop.
 * @param result - The mode's outcome.
 * @param selection - What was delivered.
 * @returns The experience, and the edit rows written alongside.
 */
export const reflectHarnessAdoption = async (
  task: HarnessTaskRun,
  result: HarnessModeResult,
  selection: HarnessSelection
): Promise<HarnessExperience | null> => {
  if (selection.label === null) {
    return null;
  }

  const root = path.join(
    task.workDir,
    "reflection",
    `${result.mode}${result.k}`
  );

  const base = Object.values(result.rollouts).filter((rollout) =>
    rollout.label.startsWith("base")
  );

  const evidence = buildHarnessEvidence(root, {
    caseName: task.caseName,
    rollouts: base,
    harnessDir: harnessDirOf(task, selection.label),
    pool: result.stages.map((stage) => ({
      label: stage.label,
      harnessDir: harnessDirOf(task, stage.label),
      rollout: result.rollouts[stage.label],
    })),
    decisions: Object.fromEntries(
      result.stages.map((stage) => [stage.label, stage.notes || stage.error])
    ),
  });

  writeAgentHarnessTree(task.baseTree, path.join(root, "base_harness"));
  writeFileSync(
    path.join(root, "adoption.json"),
    `${JSON.stringify({ chosen_label: selection.label, reason: selection.why }, null, 2)}\n`
  );
  assertNoGraderVerdicts(root, [task.caseName]);

  const reply = await callHarnessProposer({
    mission: [
      harnessExperiencePrompt(task.work),
      `# WHAT HAPPENED\n\nHarness ${selection.label} was adopted. The selection reasoning was:\n\n${selection.why}\n\nCompare context/harness/ with context/base_harness/ and the candidates in context/pool/. Read the decisions and execution contrasts before writing.`,
      harnessMission(evidence, "").trim(),
    ].join("\n\n"),
    contextDir: root,
    label: `experience.${result.mode}${result.k}`,
    harvest: false,
    auditRoot: path.join(task.workDir, "proposer"),
    ledger: task.ledger,
  });

  const edits = editsPattern.exec(reply.text)?.groups?.edits?.trim();

  if (edits !== undefined) {
    writeFileSync(path.join(root, "edits.md"), `${edits}\n`);
  }

  return parseHarnessExperience(reply.text);
};
