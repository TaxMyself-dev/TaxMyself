import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { Schema } from "effect";

import type { SerializableValue } from "../../../backend/shared/schema/json-value";

// The records of an eval run in the eval-skills toolkit's native format
// (.eval/agent, .agents/skills/eval-run/references/artifacts.md), written by
// eval-run-recorder.ts and read by run-agent-evals.ts and the toolkit's
// scripts (report.mjs, export_bundle.py, validate.ts, sample_traces.py).

/**
 * The first 16 hex characters of a text's SHA-256, to name a case or harness
 * version.
 *
 * @param text - The text.
 * @returns The hash.
 */
export const evalShortHash = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

// Where a case came from (.eval/agent/dataset/case-sources.json).
const evalCaseSourceSchema = Schema.Struct({
  kind: Schema.Literals(["incident", "synthetic"]),
  rationale: Schema.String,
  observed_at: Schema.optional(Schema.String),
});

export const evalCaseSourcesSchema = Schema.Struct({
  default: evalCaseSourceSchema,
  cases: Schema.Record(Schema.String, evalCaseSourceSchema),
});

// A case of .eval/agent/dataset/goldens.jsonl: the index of the eval files'
// tests. Each case is its own conversation and fixtures, so its own group.
export const evalGoldenSchema = Schema.Struct({
  id: Schema.String,
  group_id: Schema.String,
  input: Schema.Struct({ file: Schema.String, test: Schema.String }),
  tags: Schema.Array(Schema.String),
  source: evalCaseSourceSchema,
  case_hash: Schema.String,
});

/**
 * One eval case as the dataset holds it: its id, group, input, tags, source and
 * hash.
 */
export type EvalGolden = typeof evalGoldenSchema.Type;

// `vitest list --json`'s rows.
export const evalListedTestsSchema = Schema.Array(
  Schema.Struct({ name: Schema.String, file: Schema.String })
);

const evalUsageSchema = Schema.Struct({
  input_tokens: Schema.NullOr(Schema.Finite),
  output_tokens: Schema.NullOr(Schema.Finite),
  // Of the input, what the prompt cache served; of the output, the
  // reasoning. Missing in runs recorded before 2026-10-17.
  cached_input_tokens: Schema.optional(Schema.NullOr(Schema.Finite)),
  reasoning_tokens: Schema.optional(Schema.NullOr(Schema.Finite)),
});

/**
 * The tokens a run used: its input (and how much of it came from the cache)
 * and its output (and how much of it was reasoning).
 */
export type EvalUsage = typeof evalUsageSchema.Type;

// One criterion's verdict on a case. Pass means the failure was not seen.
const evalGradeSchema = Schema.Struct({
  passed: Schema.Boolean,
  reason: Schema.String,
  score: Schema.Finite,
  confidence: Schema.NullOr(Schema.Finite),
  grader_version: Schema.String,
});

/**
 * One judge's grade: passed, its reason, score, confidence, and the grader's
 * version.
 */
export type EvalGrade = typeof evalGradeSchema.Type;

// The fields of a results.jsonl row the runner reads back.
export const evalResultRowSchema = Schema.Struct({
  case_id: Schema.String,
  group_id: Schema.String,
  rep: Schema.Finite,
  tags: Schema.Array(Schema.String),
  grades: Schema.Record(Schema.String, evalGradeSchema),
  passed_all: Schema.Boolean,
  latency_s: Schema.Finite,
  trace_id: Schema.String,
  usage: Schema.optional(evalUsageSchema),
  case_hash: Schema.String,
  harness_hash: Schema.String,
});

/**
 * One case's result in a run: its grades, whether all passed, latency, trace,
 * usage and the hashes it ran with.
 */
export type EvalResultRow = typeof evalResultRowSchema.Type;

// One app or judge call (attempts.jsonl).
export const evalAttemptSchema = Schema.Struct({
  case_id: Schema.String,
  rep: Schema.Finite,
  attempt: Schema.Finite,
  stage: Schema.Literals(["app", "judge"]),
  status: Schema.String,
  usage: Schema.NullOr(evalUsageSchema),
  cost_usd: Schema.NullOr(Schema.Finite),
});

// A case that ended without a verdict (errors.jsonl): the app or a judge
// failed. Never counted as a graded failure.
export const evalErrorSchema = Schema.Struct({
  case_id: Schema.String,
  rep: Schema.Finite,
  stage: Schema.Literals(["app", "grader"]),
  failure_class: Schema.Literals(["harness", "timeout", "rate-limit"]),
  error: Schema.String,
  at: Schema.String,
});

/**
 * The rows of a JSON Lines file, each decoded with the schema; none when the
 * file is missing.
 *
 * @param path - The file.
 * @param schema - Each row's schema.
 * @returns The rows.
 */
export const readEvalJsonLines = <S extends Schema.ConstraintDecoder<unknown>>(
  path: string,
  schema: S
): S["Type"][] => {
  if (!existsSync(path)) {
    return [];
  }

  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(schema));

  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => decode(line));
};

/**
 * Appends one row to a JSON Lines file.
 *
 * @param path - The file.
 * @param row - The row.
 * @returns Nothing; the line is written.
 */
export const appendEvalJsonLine = (path: string, row: SerializableValue) => {
  appendFileSync(path, `${JSON.stringify(row)}\n`);
};
