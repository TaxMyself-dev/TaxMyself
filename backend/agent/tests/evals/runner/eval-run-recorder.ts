import path from "node:path";

import type { ConversationalTestCase, LLMTestCase } from "deepeval/test-case";
import { toPass } from "deepeval/vitest";
import { beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";

import { isNonEmptyText } from "../../../backend/shared/text/non-empty-text";
import type {
  AgentEvalGeneration,
  EvalCaseRecord,
  EvalMetric,
  EvalTestError,
} from "./eval-case-record";
import {
  appendEvalAttempts,
  appendEvalError,
  appendEvalResult,
  evalTraceRecord,
  isAssertion,
  judgedOutput,
} from "./eval-case-record";
import {
  evalGoldens,
  evalsRoot,
  harnessHash,
  rep,
  runDir,
  tracesPath,
} from "./eval-run-environment";
import {
  appendEvalJsonLine,
  evalResultRowSchema,
  readEvalJsonLines,
} from "./eval-run-records";

// Records every eval case of a run (tests/evals/runner/run-agent-evals.ts) in the
// eval-skills toolkit's native format under .eval/agent: one result row per
// case and repetition (runs/<variant>/results.jsonl), its trace as a review
// record (traces/traces.jsonl, read by the review app and validate.ts), the
// app and judge calls (attempts.jsonl), and the cases that ended without a
// verdict (errors.jsonl). Without AGENT_EVAL_RUN_DIR (a plain vitest run) it
// records nothing.
//
// One case runs at a time (the evals project's maxConcurrency is 1), so the
// harness and the toPass matcher add to the one current record; another
// case starting meanwhile fails as AGENT_EVAL_RECORDER_CONCURRENT.

let current: EvalCaseRecord | null = null;

const currentRecord = (testName: string | undefined) => {
  if (current && testName !== current.testName) {
    throw new Error(
      `AGENT_EVAL_RECORDER_CONCURRENT: ${testName} ran while ${current.testName} was recorded; keep the evals project's maxConcurrency at 1`
    );
  }

  return current;
};

/**
 * Called by the harness after each agent.generate.
 *
 * @param generation - One agent.generate's record.
 */
export const recordAgentEvalGeneration = (generation: AgentEvalGeneration) => {
  currentRecord(expect.getState().currentTestName)?.generations.push(
    generation
  );
};

const keepJudgedMetrics = (
  record: EvalCaseRecord,
  received: LLMTestCase | ConversationalTestCase,
  metrics: EvalMetric[]
) => {
  for (const metric of metrics) {
    record.judged.push({ metric, judgedOutput: judgedOutput(received) });

    if (metric.error !== undefined) {
      record.judgeErrors.push(`${metric.name}: ${metric.error}`);
    }
  }
};

// DeepEval's toPass, which also keeps each metric's verdict for the record.
expect.extend({
  async toPass(
    received: LLMTestCase | ConversationalTestCase,
    metrics: EvalMetric[] = [],
    options = {}
  ) {
    const record = currentRecord(this.currentTestName);

    try {
      const result = await toPass.call(this, received, metrics, options);

      if (record) {
        keepJudgedMetrics(record, received, metrics);

        if (!result.pass) {
          record.judgeFailures.push(result.message());
        }
      }

      return result;
    } catch (error) {
      record?.judgeErrors.push(String(error));
      throw error;
    }
  },
});

const finishEvalCase = (record: EvalCaseRecord, errors: EvalTestError[]) => {
  appendEvalAttempts(record);
  const golden = evalGoldens.get(record.caseId);

  if (!golden) {
    appendEvalError(
      record,
      { message: "AGENT_EVAL_CASE_NOT_IN_DATASET: rebuild goldens.jsonl" },
      null
    );

    return;
  }

  const executionError = errors.find(
    (error) =>
      !isAssertion(error) && !record.judgeFailures.includes(error.message ?? "")
  );

  const output =
    [
      record.generations.at(-1)?.output,
      record.judged.at(-1)?.judgedOutput,
    ].find((text) => isNonEmptyText(text)) ?? null;

  const trace = evalTraceRecord(
    record,
    golden,
    output,
    executionError?.message ?? null
  );

  appendEvalJsonLine(tracesPath, trace);

  // An app or judge that failed is an error, never a graded failure; the
  // slot stays empty so a resumed run retries it.
  if (executionError || record.judgeErrors.length > 0) {
    appendEvalError(record, executionError, trace.trace_id);

    return;
  }

  appendEvalResult(record, golden, trace, errors);
};

// The slots this exact harness already finished, which a resumed run skips.
const finishedEvalSlot = (caseId: string) =>
  readEvalJsonLines(`${runDir}/results.jsonl`, evalResultRowSchema).some(
    (row) =>
      row.case_id === caseId &&
      row.rep === rep &&
      row.harness_hash === harnessHash &&
      row.case_hash === evalGoldens.get(caseId)?.case_hash
  );

// The test's describe names and its own, as vitest list prints them (a
// task's fullName also carries the file path).
const evalTestName = (task: TestContext["task"]) => {
  const names = [task.name];
  let { suite } = task;

  while (suite && suite.name !== task.file.name) {
    names.unshift(suite.name);
    ({ suite } = suite);
  }

  return names.join(" > ");
};

if (runDir) {
  beforeEach((context: TestContext) => {
    // The case id is the eval file and the test's name, as goldens.jsonl
    // lists it.
    // Forward slashes on every system, as the runner writes case ids
    // (run-agent-evals.ts).
    const caseFile = path
      .relative(evalsRoot, context.task.file.filepath)
      .replaceAll(path.sep, "/");

    const caseId = `${caseFile} > ${evalTestName(context.task)}`;

    if (finishedEvalSlot(caseId)) {
      context.skip();

      return;
    }

    const record: EvalCaseRecord = {
      caseId,
      testName: expect.getState().currentTestName ?? context.task.fullName,
      startedAt: performance.now(),
      generations: [],
      judged: [],
      judgeFailures: [],
      judgeErrors: [],
    };

    current = record;
    context.onTestFinished(({ task }) => {
      current = null;
      finishEvalCase(record, task.result?.errors ?? []);
    });
  });
}
