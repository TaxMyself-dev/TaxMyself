import type { BaseConversationalMetric, BaseMetric } from "deepeval/metrics";
import { ConversationalJevEval, JevEval } from "deepeval/metrics";
import type { ConversationalTestCase } from "deepeval/test-case";
import { LLMTestCase } from "deepeval/test-case";

import { harnessHash, rep, runDir, variant } from "./eval-run-environment";
import { appendEvalJsonLine, evalShortHash } from "./eval-run-records";
import type { EvalGolden, EvalGrade, EvalUsage } from "./eval-run-records";

// One eval case's record (eval-run-recorder.ts) and how it is written under
// .eval/agent: its result row, its trace as a review record, its app and
// judge calls, and an error when it reached no verdict.

/**
 * One agent.generate call of a case, as the harness reports it.
 */
export interface AgentEvalGeneration {
  input: string;
  output: string;
  toolsCalled: { name: string; input: unknown; output: unknown }[];
  steps: {
    type: "llm" | "tool";
    name: string;
    input?: unknown;
    output?: unknown;
    model?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
  }[];
  model: string;
  usage: EvalUsage;
  latencyMs: number;
}

/**
 * A DeepEval metric, single-turn or conversational.
 */
export type EvalMetric = BaseMetric | BaseConversationalMetric;

/**
 * What one eval case recorded while it ran: its generations, what each judge
 * read, and the judges' failures and errors.
 */
export interface EvalCaseRecord {
  caseId: string;
  testName: string;
  startedAt: number;
  generations: AgentEvalGeneration[];
  judged: { metric: EvalMetric; judgedOutput: string | null }[];
  // toPass's failure messages, to tell a judge's fail from a code check's.
  judgeFailures: string[];
  judgeErrors: string[];
}

const evalMetricQuestions = (metric: EvalMetric) =>
  metric instanceof JevEval || metric instanceof ConversationalJevEval
    ? metric.questions.map((question) => question.text)
    : [];

// What the criterion is, so a changed question or threshold reads as a new
// grader version.
const evalGraderVersion = (metric: EvalMetric) =>
  `${metric.evaluationModel ?? "deepeval"}:${evalShortHash(
    JSON.stringify([
      metric.name,
      metric.threshold,
      metric.strictMode,
      evalMetricQuestions(metric),
    ])
  )}`;

/**
 * The answer a judge read: the test case's output, or a conversation's last
 * turn.
 *
 * @param received - The test case the judge read.
 * @returns The output, or null.
 */
export const judgedOutput = (received: LLMTestCase | ConversationalTestCase) =>
  received instanceof LLMTestCase
    ? (received.actualOutput ?? null)
    : (received.turns.at(-1)?.content ?? null);

/**
 * A test's error as Vitest reports it: its name and message.
 */
export interface EvalTestError {
  name?: string;
  message?: string;
}

// What stopped a case that reached no verdict.
const evalFailureClass = (error: EvalTestError) => {
  const text = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (text.includes("timed out")) {
    return "timeout";
  }

  return ["429", "rate limit", "rate_limit", "overloaded"].some((hint) =>
    text.includes(hint)
  )
    ? "rate-limit"
    : "harness";
};

/**
 * Whether a test error is an assertion's (a code check), not a crash.
 *
 * @param error - The test's error.
 * @returns Whether it is an AssertionError.
 */
export const isAssertion = (error: EvalTestError) =>
  error.name === "AssertionError";

/**
 * One case's trace for the run's records: its ids, timing, input and output,
 * tags, metadata, steps and error.
 *
 * @param record - What the case recorded.
 * @param golden - The case.
 * @param output - The answer the judges read.
 * @param error - The case's error, if any.
 * @returns The trace.
 */
export const evalTraceRecord = (
  record: EvalCaseRecord,
  golden: EvalGolden,
  output: string | null,
  error: string | null
) => {
  const durationMs = performance.now() - record.startedAt;

  return {
    trace_id: `${variant}/${record.caseId}#${rep}`,
    thread_id: `${record.caseId}#${rep}`,
    case_id: record.caseId,
    group_id: golden.group_id,
    started_at: new Date(Date.now() - durationMs).toISOString(),
    duration_ms: Math.round(durationMs),
    input:
      record.generations.map((generation) => generation.input).join("\n\n") ||
      golden.input.test,
    output,
    tags: golden.tags,
    metadata: {
      variant,
      rep,
      case_id: record.caseId,
      model: record.generations.at(-1)?.model ?? null,
      // What each judge asked, without its verdict, so a reviewer labels the
      // case unanchored (the calibration protocol).
      judges: record.judged.map(({ metric }) => ({
        name: metric.name,
        questions: evalMetricQuestions(metric),
      })),
      // Cases that call a backend function instead of the agent keep only
      // what their judge read; the rest is checked in code.
      capture:
        record.generations.length > 0 ? "agent-steps" : "judge-input-only",
    },
    steps: record.generations.flatMap((generation) => generation.steps),
    error,
  };
};

const sumKnownTokens = (values: (number | null)[]) =>
  values.includes(null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

/**
 * Appends each of the case's generations to the run's attempts, with the
 * judges' costs.
 *
 * @param record - What the case recorded.
 */
export const appendEvalAttempts = (record: EvalCaseRecord) => {
  const attemptsPath = `${runDir}/attempts.jsonl`;

  for (const [index, generation] of record.generations.entries()) {
    appendEvalJsonLine(attemptsPath, {
      case_id: record.caseId,
      rep,
      attempt: index + 1,
      stage: "app",
      status: "ok",
      model: generation.model,
      usage: generation.usage,
      cost_usd: null,
      latency_s: generation.latencyMs / 1000,
    });
  }

  for (const [index, { metric }] of record.judged.entries()) {
    appendEvalJsonLine(attemptsPath, {
      case_id: record.caseId,
      rep,
      attempt: record.generations.length + index + 1,
      stage: "judge",
      status: metric.error === undefined ? "ok" : "grader-error",
      grader: metric.name,
      usage: null,
      cost_usd: metric.evaluationCost ?? null,
    });
  }
};

// Each judge's verdict, and the code assertions as one more criterion.
const evalGrades = (
  record: EvalCaseRecord,
  codeFailure: EvalTestError | undefined
) => {
  const grades = new Map<string, EvalGrade>([
    [
      "code-checks",
      {
        passed: codeFailure === undefined,
        reason:
          codeFailure?.message?.slice(0, 1000) ?? "Every code assertion held.",
        score: codeFailure === undefined ? 1 : 0,
        confidence: null,
        grader_version: `code:${harnessHash}`,
      },
    ],
  ]);

  for (const { metric } of record.judged) {
    grades.set(grades.has(metric.name) ? `${metric.name} #2` : metric.name, {
      passed: metric.success === true,
      reason: metric.reason ?? "",
      score: metric.score ?? 0,
      confidence: metric.confidence ?? null,
      grader_version: evalGraderVersion(metric),
    });
  }

  return Object.fromEntries(grades);
};

/**
 * Appends the case's result to the run's results: its grades from each judge
 * and code check.
 *
 * @param record - What the case recorded.
 * @param golden - The case.
 * @param trace - Its trace.
 * @param errors - The test's errors.
 */
export const appendEvalResult = (
  record: EvalCaseRecord,
  golden: EvalGolden,
  trace: ReturnType<typeof evalTraceRecord>,
  errors: EvalTestError[]
) => {
  const codeFailure = errors.find(
    (error) =>
      isAssertion(error) && !record.judgeFailures.includes(error.message ?? "")
  );

  const last = record.generations.at(-1);
  appendEvalJsonLine(`${runDir}/results.jsonl`, {
    case_id: record.caseId,
    group_id: golden.group_id,
    rep,
    tags: golden.tags,
    input: trace.input,
    // A case whose result is checked only in code keeps no app output.
    output:
      trace.output ?? "(not captured: this case checks its result in code)",
    tools_called: record.generations.flatMap(
      (generation) => generation.toolsCalled
    ),
    grades: evalGrades(record, codeFailure),
    passed_all: errors.length === 0,
    latency_s: trace.duration_ms / 1000,
    attempts: 1,
    trace,
    trace_id: trace.trace_id,
    model: last?.model ?? null,
    usage: {
      input_tokens: last
        ? sumKnownTokens(record.generations.map((g) => g.usage.input_tokens))
        : null,
      output_tokens: last
        ? sumKnownTokens(record.generations.map((g) => g.usage.output_tokens))
        : null,
      cached_input_tokens: last
        ? sumKnownTokens(
            record.generations.map((g) => g.usage.cached_input_tokens ?? null)
          )
        : null,
      reasoning_tokens: last
        ? sumKnownTokens(
            record.generations.map((g) => g.usage.reasoning_tokens ?? null)
          )
        : null,
    },
    case_hash: golden.case_hash,
    harness_hash: harnessHash,
    at: new Date().toISOString(),
  });
};

/**
 * Appends a case that failed to run to the run's errors.
 *
 * @param record - What the case recorded.
 * @param executionError - Why it failed to run.
 * @param traceId - Its trace, if any.
 * @returns Nothing; the line is written.
 */
export const appendEvalError = (
  record: EvalCaseRecord,
  executionError: EvalTestError | undefined,
  traceId: string | null
) => {
  appendEvalJsonLine(`${runDir}/errors.jsonl`, {
    case_id: record.caseId,
    rep,
    stage: executionError || traceId === null ? "app" : "grader",
    failure_class: executionError
      ? evalFailureClass(executionError)
      : "harness",
    error: (executionError?.message ?? record.judgeErrors.join("\n")).slice(
      0,
      2000
    ),
    trace_id: traceId,
    at: new Date().toISOString(),
  });
};
