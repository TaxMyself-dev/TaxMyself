import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The tripwire that keeps the eval's verdicts away from the harnessing
// method (Harness² core/context.py, assert_no_grader_verdicts): the method
// never sees a grade, a judge's question or a case's name, which says what
// the case expects. It runs on every evidence tree before a proposer reads
// it and on every proposed harness before it is rolled or stored. If it
// fires, find the read path that produced the match; do not widen around it.

// Strings only a verdict or a judge carries (eval-case-record.ts writes
// them into results.jsonl and a trace's metadata).
const graderVerdictMarkers = [
  '"passed_all"',
  '"grades"',
  '"grader_version"',
  '"judges"',
  "[JevEval]",
  "code-checks",
] as const;

const verdictMarkerIn = (
  text: string,
  markers: readonly string[]
): string | undefined => markers.find((marker) => text.includes(marker));

/**
 * Throws HARNESS_GRADER_VERDICT_LEAK when any file under root carries a
 * verdict marker or one of the extra markers (a case's name) in its name
 * or text.
 *
 * @param root - The evidence tree.
 * @param extraMarkers - More strings that must not reach a model.
 */
export const assertNoGraderVerdicts = (
  root: string,
  extraMarkers: readonly string[] = []
) => {
  const markers = [...graderVerdictMarkers, ...extraMarkers];

  for (const entry of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) {
      continue;
    }

    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file);

    const marker =
      verdictMarkerIn(relative, markers) ??
      verdictMarkerIn(readFileSync(file, "utf-8"), markers);

    if (marker !== undefined) {
      throw new Error(
        `HARNESS_GRADER_VERDICT_LEAK: ${relative} carries ${JSON.stringify(marker)}; a verdict would reach the proposer. Find the read path that produced it.`
      );
    }
  }
};

/**
 * The same tripwire on a proposed harness tree, before it is rolled or
 * stored: a harness that carries a marker could never be served as
 * evidence to a later task.
 *
 * @param tree - Each file's path and text.
 */
export const assertHarnessTreeHasNoGraderVerdicts = (
  tree: Readonly<Record<string, string>>
) => {
  for (const [file, text] of Object.entries(tree)) {
    const marker =
      verdictMarkerIn(file, graderVerdictMarkers) ??
      verdictMarkerIn(text, graderVerdictMarkers);

    if (marker !== undefined) {
      throw new Error(
        `HARNESS_GRADER_VERDICT_LEAK: harness file \`${file}\` contains ${JSON.stringify(marker)}; remove that string.`
      );
    }
  }
};

const measurementWords = [
  "benchmark",
  "evaluation",
  "grader",
  "rubric",
  "score",
] as const;

/**
 * Throws HARNESS_PROMPT_NAMES_MEASUREMENT when a text the prompts show the
 * proposer names how the work is measured instead of the work (Harness²
 * BenchPrompts).
 *
 * @param field - The text's name, for the error.
 * @param text - The text.
 */
export const assertDescribesTheWork = (field: string, text: string) => {
  const lower = text.toLowerCase();
  const found = measurementWords.find((word) => lower.includes(word));

  if (found !== undefined) {
    throw new Error(
      `HARNESS_PROMPT_NAMES_MEASUREMENT: ${field} must describe the work, not its measurement (found ${JSON.stringify(found)}).`
    );
  }
};
