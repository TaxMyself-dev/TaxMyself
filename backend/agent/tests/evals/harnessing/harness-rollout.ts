import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import { evalShortHash, readEvalJsonLines } from "../runner/eval-run-records";

// One rollout of an eval case under a harness, for agent harnessing
// (Harness² BenchmarkAdapter.execute, trajectory, delivered): the case runs
// through vitest exactly as bun run eval runs it, into its own run
// directory, with AGENT_HARNESS_DIR naming the harness (none for the base).
// What the method reads back is the trace (the user's messages, every
// model step and tool call, the answer); the run's results.jsonl holds the
// verdict and is read only by harness-judge.ts, after selection.

const projectRoot = path.resolve(import.meta.dirname, "../../..");

// Vitest's own entry, run with this Node: node_modules/.bin/vitest is a shell
// script on macOS and Linux and a .cmd on Windows, which spawn runs without
// a shell only on the first two.
const vitestEntry = path.join(projectRoot, "node_modules/vitest/vitest.mjs");
const evalsRoot = path.join(projectRoot, "tests/evals");

/**
 * The dataset rollouts read their case from (bun run eval writes it).
 */
export const agentEvalDatasetPath = path.join(
  projectRoot,
  ".eval/agent/dataset/goldens.jsonl"
);

// A case that takes longer than this is stuck, not slow.
const rolloutTimeoutMs = 15 * 60 * 1000;

// One observation longer than this is cut, with a marker (Harness²
// obs_trunc); the trajectory itself is never clipped.
const observationLimit = 50_000;

/**
 * What the method knows about one finished rollout. Never carries a
 * verdict.
 */
export interface HarnessRunView {
  readonly label: string;
  readonly runDir: string;
  readonly ok: boolean;
  readonly delivered: boolean;
  readonly error: string;
}

const harnessTraceSchema = Schema.Struct({
  case_id: Schema.String,
  input: Schema.String,
  output: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  steps: Schema.Array(
    Schema.Union([
      Schema.Struct({
        type: Schema.Literal("llm"),
        name: Schema.String,
        output: Schema.optional(Schema.String),
      }),
      Schema.Struct({
        type: Schema.Literal("tool"),
        name: Schema.String,
        input: Schema.optional(Schema.Unknown),
        output: Schema.optional(Schema.Unknown),
      }),
    ])
  ),
});

type HarnessTrace = typeof harnessTraceSchema.Type;

/**
 * The case's trace from a rollout's run directory.
 *
 * @param runDir - The rollout's run directory.
 * @returns The trace, or undefined when the run recorded none.
 */
export const readRolloutTrace = (runDir: string): HarnessTrace | undefined =>
  readEvalJsonLines(path.join(runDir, "traces.jsonl"), harnessTraceSchema).at(
    -1
  );

const escapeTestPattern = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

// "agent/x.eval.ts > describe > test" -> the file, and a -t pattern for
// exactly that test: vitest matches it against "describe > test", so it is
// anchored and a sibling whose name contains this one never runs too.
const caseLocation = (caseId: string) => {
  const [file = "", ...names] = caseId.split(" > ");

  return {
    file: path.join(evalsRoot, file),
    testPattern: `^${escapeTestPattern(names.join(" > "))}$`,
  };
};

const runRolloutCase = async (caseId: string, env: NodeJS.ProcessEnv) => {
  const { file, testPattern } = caseLocation(caseId);

  const child = spawn(
    process.execPath,
    [vitestEntry, "run", "--project", "evals", file, "-t", testPattern],
    { cwd: projectRoot, env, stdio: ["ignore", "pipe", "pipe"] }
  );

  let tail = "";

  const keepTail = (chunk: Buffer) => {
    tail = `${tail}${chunk.toString()}`.slice(-2000);
  };

  child.stdout.on("data", keepTail);
  child.stderr.on("data", keepTail);

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, rolloutTimeoutMs);

  await once(child, "close");
  clearTimeout(timer);

  return tail;
};

/**
 * Runs one rollout, or reuses the one already in its run directory (a
 * resumed loop). A rollout that dies is recorded, never thrown.
 *
 * @param caseId - The eval case.
 * @param label - The rollout's label (base1, inv1, agg1...).
 * @param harnessDir - The harness tree's directory; undefined for the base.
 * @param runDir - Where the rollout records.
 * @returns What the method may know about it.
 */
export const executeHarnessRollout = async (
  caseId: string,
  label: string,
  harnessDir: string | undefined,
  runDir: string
): Promise<HarnessRunView> => {
  mkdirSync(runDir, { recursive: true });
  let tail = "";

  if (readRolloutTrace(runDir) === undefined) {
    tail = await runRolloutCase(caseId, {
      ...process.env,
      DEEPEVAL_TELEMETRY_OPT_OUT: "1",
      LANGFUSE_TRACING_ENVIRONMENT: "eval",
      AGENT_EVAL_RUN_DIR: runDir,
      AGENT_EVAL_REP: "0",
      AGENT_EVAL_VARIANT: `harnessing-${label}`,
      AGENT_EVAL_HARNESS_HASH: evalShortHash(harnessDir ?? "base"),
      AGENT_EVAL_DATASET: agentEvalDatasetPath,
      AGENT_EVAL_TRACES: path.join(runDir, "traces.jsonl"),
      // Empty runs the agent as written (agentEvalHarness).
      AGENT_HARNESS_DIR: harnessDir ?? "",
    });
  }

  const trace = readRolloutTrace(runDir);
  // A case that crashed before the agent answered records no steps, and
  // its trace's input falls back to the case's name (evalTraceRecord): it
  // is no evidence.
  const recorded = trace !== undefined && trace.steps.length > 0;

  return {
    label,
    runDir,
    ok: recorded,
    delivered: (trace?.output ?? "").trim() !== "",
    error: recorded
      ? (trace.error ?? "")
      : `the case recorded no agent steps: ${trace?.error ?? tail.slice(-600)}`,
  };
};

/**
 * The task as the agent received it: the user's messages only, never the
 * case's name, which says what is expected.
 *
 * @param runDir - A rollout's run directory.
 * @returns The task's text.
 */
export const rolloutTaskText = (runDir: string) =>
  `# The user's messages, as the agent received them\n\n${readRolloutTrace(runDir)?.input ?? "(unavailable)"}\n`;

/**
 * The answer a rollout delivered to the user.
 *
 * @param runDir - A rollout's run directory.
 * @returns The answer, or a note that there was none.
 */
export const rolloutDeliverableText = (runDir: string) => {
  const output = readRolloutTrace(runDir)?.output ?? "";

  return output.trim() === "" ? "(no answer delivered)\n" : `${output}\n`;
};

const observationText = (text: string) =>
  text.length > observationLimit
    ? `${text.slice(0, observationLimit)}\n[renderer truncated this observation at ${observationLimit.toLocaleString("en")} characters]`
    : text;

/**
 * A rollout's full trajectory in the [ACTION]/[OBSERVATION]/[ERROR]
 * grammar: each model step's text, each tool call with its input and
 * output, and the answer.
 *
 * @param runDir - A rollout's run directory.
 * @returns The trajectory.
 */
export const rolloutTrajectoryText = (runDir: string) => {
  const trace = readRolloutTrace(runDir);

  if (trace === undefined) {
    return "(trajectory unavailable: the run recorded no trace)\n";
  }

  const lines = ["# Trajectory", "", "## The user's messages", trace.input, ""];

  for (const step of trace.steps) {
    if (step.type === "llm") {
      if (step.name === "step 1" && lines.length > 5) {
        lines.push("## The next user turn starts", "");
      }

      lines.push(
        `[ACTION] model ${step.name} wrote: ${observationText(step.output ?? "")}`
      );
    } else {
      lines.push(
        `[ACTION] tool ${step.name} called with ${observationText(JSON.stringify(step.input ?? null))}`,
        `[OBSERVATION] ${observationText(JSON.stringify(step.output ?? null))}`
      );
    }
  }

  lines.push(
    "",
    "## The answer the user saw",
    trace.output ?? "(none)",
    ...(trace.error === null ? [] : ["", `[ERROR] ${trace.error}`])
  );

  return `${lines.join("\n")}\n`;
};
