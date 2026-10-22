import { writeFileSync } from "node:fs";
import path from "node:path";

import { isNonEmptyText } from "../../../backend/shared/text/non-empty-text";
import {
  evalAttemptSchema,
  evalErrorSchema,
  evalResultRowSchema,
  readEvalJsonLines,
} from "./eval-run-records";
import {
  caseLevel,
  compareEvalVariants,
  evalCaseSplit,
  formatRate,
  sumKnown,
} from "./eval-run-statistics";

// An agent eval run's summary (run-agent-evals.ts): each case's result,
// read from the run's report, as one table.

/**
 * The run the summary describes, as the runner was started: the eval
 * folder, the variant, the repetitions, and the variant to compare with.
 */
interface EvalRunOptions {
  readonly evalRoot: string;
  readonly variant: string;
  readonly reps: number;
  readonly compareTo: string | undefined;
}

/**
 * Writes the run's summary.json: pass rates per criterion and per split,
 * errors, missing slots and usage, compared with another variant when one
 * is named.
 *
 * @param runDir - The run's directory.
 * @param fingerprint - The run's fingerprint; other rows are left out.
 * @param caseCount - How many cases the dataset has.
 * @param run - The runner's options (EvalRunOptions).
 */
export const summarizeEvalRun = (
  runDir: string,
  fingerprint: string,
  caseCount: number,
  { evalRoot, variant, reps, compareTo }: EvalRunOptions
) => {
  const rows = readEvalJsonLines(
    path.join(runDir, "results.jsonl"),
    evalResultRowSchema
  ).filter((row) => row.harness_hash === fingerprint);

  const errors = readEvalJsonLines(
    path.join(runDir, "errors.jsonl"),
    evalErrorSchema
  );

  const attempts = readEvalJsonLines(
    path.join(runDir, "attempts.jsonl"),
    evalAttemptSchema
  );

  const criteria = [
    ...new Set(rows.flatMap((row) => Object.keys(row.grades))),
  ].toSorted();

  const tags = [
    ...new Set(rows.map((row) => row.tags[0] ?? "untagged")),
  ].toSorted();

  const latencies = rows.map((row) => row.latency_s).toSorted((a, b) => a - b);

  const percentile = (q: number) =>
    latencies[
      Math.min(latencies.length - 1, Math.floor(q * latencies.length))
    ] ?? null;

  const appCalls = attempts.filter((attempt) => attempt.stage === "app");

  const appTokens = (
    field: "input_tokens" | "cached_input_tokens" | "reasoning_tokens"
  ) => sumKnown(appCalls.map((call) => call.usage?.[field]));

  const splitRows = (split: "train" | "test") =>
    rows.filter((row) => evalCaseSplit(row.group_id) === split);

  const baselineRows = isNonEmptyText(compareTo)
    ? readEvalJsonLines(
        path.join(evalRoot, "runs", compareTo, "results.jsonl"),
        evalResultRowSchema
      )
    : [];

  const compareSplit = (split: "train" | "test") =>
    isNonEmptyText(compareTo)
      ? compareEvalVariants(
          splitRows(split),
          baselineRows.filter((row) => evalCaseSplit(row.group_id) === split),
          compareTo
        )
      : null;

  const judgeCalls = attempts.filter((attempt) => attempt.stage === "judge");
  const overall = caseLevel(rows, (row) => row.passed_all);

  const summary = {
    cases: caseCount,
    reps,
    rows: rows.length,
    pass_rate_all: overall.pass_rate,
    ci95_all: overall.ci95,
    cases_scored: overall.n_cases,
    noise_floor_approx:
      overall.n_cases > 0 ? 1 / Math.sqrt(overall.n_cases) : null,
    interval_method: "Wilson over cases; repetitions averaged within each case",
    per_failure_mode: Object.fromEntries(
      criteria.map((criterion) => [
        criterion,
        caseLevel(rows, (row) => row.grades[criterion]?.passed),
      ])
    ),
    per_split: {
      train: caseLevel(splitRows("train"), (row) => row.passed_all),
      test: caseLevel(splitRows("test"), (row) => row.passed_all),
    },
    per_tag: Object.fromEntries(
      tags.map((tag) => [
        tag,
        caseLevel(
          rows.filter((row) => (row.tags[0] ?? "untagged") === tag),
          (row) => row.passed_all
        ),
      ])
    ),
    latency_s: { p50: percentile(0.5), p95: percentile(0.95) },
    usage_by_stage: {
      app: {
        calls: appCalls.length,
        input_tokens: appTokens("input_tokens"),
        cached_input_tokens: appTokens("cached_input_tokens"),
        reasoning_tokens: appTokens("reasoning_tokens"),
        output_tokens: sumKnown(
          appCalls.map((call) => call.usage?.output_tokens)
        ),
        // The monitor cases call OpenAI outside the agent;
        // their calls are not counted.
        complete: false,
      },
      judge: {
        calls: judgeCalls.length,
        cost_usd: sumKnown(judgeCalls.map((call) => call.cost_usd)),
      },
    },
    errors: {
      app: errors.filter((error) => error.stage === "app").length,
      grader: errors.filter((error) => error.stage === "grader").length,
      timeout: errors.filter((error) => error.failure_class === "timeout")
        .length,
      rate_limit: errors.filter((error) => error.failure_class === "rate-limit")
        .length,
    },
    missing_slots: caseCount * reps - rows.length,
    compare: isNonEmptyText(compareTo)
      ? {
          all: compareEvalVariants(rows, baselineRows, compareTo),
          train: compareSplit("train"),
          test: compareSplit("test"),
        }
      : null,
  };

  writeFileSync(
    path.join(runDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(
    `\n${variant}: every check passes ${formatRate(summary.pass_rate_all)} over ${summary.cases_scored} cases (${rows.length} runs; 95% CI ${formatRate(summary.ci95_all[0])}–${formatRate(summary.ci95_all[1])})`
  );

  for (const [split, stats] of Object.entries(summary.per_split)) {
    console.log(
      `  ${split}: ${formatRate(stats.pass_rate)} (${stats.n_cases} cases)`
    );
  }

  const { input_tokens: input, cached_input_tokens: cached } =
    summary.usage_by_stage.app;

  const cacheShare =
    input.total !== null && input.total > 0 && cached.total !== null
      ? `${Math.round((100 * cached.total) / input.total)}%`
      : "n/a";

  console.log(
    `  latency p50 ${summary.latency_s.p50 ?? "n/a"} s, p95 ${summary.latency_s.p95 ?? "n/a"} s; app input ${input.total ?? "n/a"} tokens, ${cacheShare} from the cache`
  );

  for (const [criterion, stats] of Object.entries(summary.per_failure_mode)) {
    console.log(
      `  ${criterion}: ${formatRate(stats.pass_rate)} (${stats.n_cases} cases)`
    );
  }

  console.log(
    `  ${summary.missing_slots} of ${caseCount * reps} slots without a result (errors.jsonl, or filtered out); rerun the same command to retry them.`
  );
};
