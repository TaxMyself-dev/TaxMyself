import path from "node:path";

import { evalGoldenSchema, readEvalJsonLines } from "./eval-run-records";

// The eval run a vitest process records into (eval-run-recorder.ts), as
// run-agent-evals.ts passes it in the environment: empty outside a run.

export const runDir = process.env.AGENT_EVAL_RUN_DIR ?? "";
export const rep = Number(process.env.AGENT_EVAL_REP ?? "0");
export const harnessHash = process.env.AGENT_EVAL_HARNESS_HASH ?? "unknown";
export const variant = process.env.AGENT_EVAL_VARIANT ?? "unknown";
export const tracesPath = process.env.AGENT_EVAL_TRACES ?? "";

// tests/evals, not this folder: case ids ("agent/x.eval.ts > name") are
// paths from it, and past runs and the dataset are keyed by them.
export const evalsRoot = path.join(import.meta.dirname, "..");

export const evalGoldens = new Map(
  readEvalJsonLines(process.env.AGENT_EVAL_DATASET ?? "", evalGoldenSchema).map(
    (golden) => [golden.id, golden]
  )
);
