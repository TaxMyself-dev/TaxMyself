import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { evalShortHash } from "../runner/eval-run-records";
import type { AgentHarnessTree } from "./agent-harness-tree";
import {
  agentHarnessTreeChanges,
  baseAgentHarnessTree,
  readAgentHarnessTree,
  writeAgentHarnessTree,
} from "./agent-harness-tree";
import {
  assertHarnessTreeHasNoGraderVerdicts,
  assertNoGraderVerdicts,
} from "./harness-evidence-guard";

// The per-area experience library (Harness² core/library.py): what earlier
// tasks in the same area adopted, read by every later task's proposers.
//
//   <root>/<area>/INDEX.md
//   <root>/<area>/harnesses/<task>/harness/      the full adopted tree
//   <root>/<area>/harnesses/<task>/EXPERIENCE.md why picked, edit rows, lesson
//
// An area's directory only holds that area's entries, so retrieval is by
// construction. A task is stored only with a lesson (cue, lesson, evidence).

/**
 * The experience reflection wrote: the edit rows and the one lesson.
 */
export interface HarnessExperience {
  readonly cue: string;
  readonly lesson: string;
  readonly evidence: string;
  readonly confidence: string;
  readonly edits: string;
}

// Opaque: a case's name says what it expects, so it never names an entry
// another task's proposers read.
const taskSlug = (caseId: string) => `task-${evalShortHash(caseId)}`;

/**
 * An area's library directory.
 *
 * @param root - The run's library root.
 * @param area - The eval area (searches, behavior...).
 * @returns The directory.
 */
export const harnessLibraryDir = (root: string, area: string) =>
  path.join(root, area.replaceAll(/[/\\\s]+/gu, "__") || "unknown");

const harnessInventory = (tree: AgentHarnessTree) => {
  const changes = agentHarnessTreeChanges(baseAgentHarnessTree(), tree);
  const changed = [...changes.added, ...changes.modified];
  const instructions = (tree["instructions.md"] ?? "").length;

  const changeNote =
    changed.length === 0
      ? "no changes"
      : "changed: ".concat(changed.join(", "));

  return `${changeNote}; ${instructions.toLocaleString("en")} always-on instruction chars`;
};

const experienceCue = (file: string) =>
  existsSync(file)
    ? (readFileSync(file, "utf-8")
        .split("\n")
        .find((line) => line.startsWith("- **cue**:"))
        ?.slice("- **cue**:".length)
        .trim() ?? "")
    : "";

/**
 * Regenerates an area's INDEX.md from what is on disk.
 *
 * @param dir - The area's library directory.
 * @param area - The area's name.
 */
export const rebuildHarnessLibraryIndex = (dir: string, area: string) => {
  const harnesses = path.join(dir, "harnesses");
  const names = existsSync(harnesses) ? readdirSync(harnesses).toSorted() : [];

  const rows = [
    `# Library — ${area}`,
    "",
    "Each entry is an earlier task in THIS area whose harness was chosen, stored with its FULL component tree and why it was picked. Browse this index, then open the entries that look relevant to the matter in front of you.",
    "",
    ...(names.length === 0
      ? ["_(empty — this is the first task in this area)_"]
      : []),
    ...names.flatMap((name) => {
      const cue = experienceCue(path.join(harnesses, name, "EXPERIENCE.md"));
      const tree = readAgentHarnessTree(path.join(harnesses, name, "harness"));

      return [
        `## \`harnesses/${name}/\``,
        `- harness: \`harnesses/${name}/harness/\` — ${harnessInventory(tree)}`,
        `- why:     \`harnesses/${name}/EXPERIENCE.md\``,
        ...(cue === "" ? [] : [`- cue:     ${cue}`]),
        "",
      ];
    }),
  ];

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "INDEX.md"), rows.join("\n"));
};

/**
 * Stores one adopted harness with why it was adopted, when reflection
 * found a lesson, and rebuilds the index.
 *
 * @param dir - The area's library directory.
 * @param area - The area's name.
 * @param entry - The task, the adopted label, why, the tree and the
 *   experience.
 * @returns The entry's directory, or null when nothing was stored.
 */
export const addHarnessLibraryEntry = (
  dir: string,
  area: string,
  entry: {
    caseId: string;
    label: string;
    why: string;
    tree: AgentHarnessTree;
    experience: HarnessExperience | null;
  }
) => {
  const { experience } = entry;

  if (experience === null) {
    return null;
  }

  assertHarnessTreeHasNoGraderVerdicts(entry.tree);
  const entryDir = path.join(dir, "harnesses", taskSlug(entry.caseId));

  writeAgentHarnessTree(entry.tree, path.join(entryDir, "harness"));
  writeFileSync(
    path.join(entryDir, "EXPERIENCE.md"),
    [
      `# ${taskSlug(entry.caseId)}`,
      "",
      `- adopted: \`${entry.label}\``,
      `- components: ${harnessInventory(entry.tree)}`,
      "",
      ...(entry.why.trim() === ""
        ? []
        : ["## Why this was chosen", entry.why.trim(), ""]),
      ...(experience.edits.trim() === ""
        ? []
        : ["## What each edit did", experience.edits.trim(), ""]),
      "## Transferable lesson",
      `- **cue**: ${experience.cue}`,
      `- **lesson**: ${experience.lesson}`,
      `- **evidence**: ${experience.evidence}`,
      `- **confidence**: ${experience.confidence}`,
      "",
    ].join("\n")
  );
  assertNoGraderVerdicts(entryDir);
  rebuildHarnessLibraryIndex(dir, area);

  return entryDir;
};
