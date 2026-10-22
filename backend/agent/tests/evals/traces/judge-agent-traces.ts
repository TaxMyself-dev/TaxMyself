import { writeFileSync } from "node:fs";

import { Effect, Metric, Schema } from "effect";

import {
  JevClient,
  jevInputPriceUsd,
  jevInputTokens,
  jevNewestModel,
} from "../../../backend/shared/ai/typesafe-jev-client";
import { readAgentTraces, writeAgentTraceScores } from "./agent-trace-langfuse";

// Judges real agent answers in Langfuse, one failure per judge, drawn from
// the failures we saw in real chats (add one judge per failure you see):
//
//   bun --env-file=.env.local tests/evals/traces/judge-agent-traces.ts \
//     [--environment development] [--since 2026-10-07T00:00:00Z] \
//     [--limit 50] [--write-scores] [--label-file .eval/agent/judge-labels.md]
//
// Reads each `answer-chat-message` trace (the user's message, the answer,
// and every TOOL span with its input and output), judges it, prints the
// verdicts, and with --write-scores writes one boolean score per applicable
// judge to the trace (agent-judge-<name>, 1 = the failure is there), so
// Langfuse filters show the flagged traces. A flagged trace becomes a
// real-chat case (an eval case in tests/evals/agent/) and a fix: that is
// the loop in docs/engineering/evals.md.
//
// Jev answers the questions that need reading the answer, as the agent's own
// answer check does (agent-answer-check.ts); code decides the rest. Langfuse's
// own LLM-as-judge evaluators are not used: they need a provider key in
// Langfuse, and the owner chose Jev (2026-10-14). Run on demand, as the
// Grafana checks are; nothing schedules it. --label-file writes each answer
// with every verdict for the owner to mark right or wrong: the human labels
// that calibrate the judges (docs/engineering/evals.md); .eval is git-ignored, so the
// chats stay local.

// A Jev answer at or above this flags the failure. Calibrated 2026-10-14 on
// the 25 development answers since 2026-10-01, labeled by reading the traces
// (by the agent, not the owner: provisional until the owner labels some):
// at 0.5 no_result flagged a reply to "hi" (0.59) and count_mismatch an
// answer whose one count matched (0.68); at 0.7 both clear and the true
// flags stay (cut-off answers at 0.74, 0.85, 0.89). Missed at any
// threshold: one cut-off answer Jev scored low. Details in docs/engineering/evals.md.
const agentTraceJudgeFlagged = 0.7;
const agentTraceFlagged = (noul: number) => noul >= agentTraceJudgeFlagged;

// How much of the tools' outputs Jev reads, newest last.
const agentTraceToolOutputsMaxLength = 30_000;

/**
 * One tool call in a trace: its name, input and output as text.
 */
interface AgentTraceToolCall {
  name: string;
  input: string;
  output: string;
  // Whether the call failed (its span's level is ERROR).
  failed: boolean;
}

/**
 * An agent answer as the judges read it: the user's message, the answer and its
 * tool calls.
 */
export interface AgentTrace {
  traceId: string;
  userMessage: string;
  answer: string;
  tools: AgentTraceToolCall[];
}

/**
 * The failures the judges look for, one per judge.
 */
type AgentTraceJudgeName =
  | "no_result"
  | "count_mismatch"
  | "repeated_read"
  | "tool_error_unexplained";

/**
 * A judge's verdict on one trace: flagged when the failure is there; null
 * when the judge does not apply (no tool failed).
 */
export type AgentTraceVerdicts = Partial<
  Record<AgentTraceJudgeName, { flagged: boolean; reason: string }>
>;

const agentTraceErrorCode = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b(?=:)/u;

/**
 * The trace's first tool that failed with a coded error (`<CODE>: …`); a
 * result that only mentions a code, such as a playbook's text, did not fail.
 *
 * @param trace - The trace.
 * @returns The failed tool call, or undefined.
 */
export const agentTraceFailedTool = (trace: AgentTrace) =>
  trace.tools.find(
    (tool) => tool.failed && agentTraceErrorCode.test(tool.output)
  );

/**
 * The judges code decides from the tool spans alone: the same read made
 * twice with the same input in one answer (its result could not change, and
 * a paced or paid read spends the user's budget again).
 *
 * @param trace - The trace.
 * @returns The repeated read verdict.
 */
export const codeAgentTraceVerdicts = (
  trace: AgentTrace
): AgentTraceVerdicts => {
  const calls = trace.tools.map((tool) => `${tool.name}(${tool.input})`);

  const repeated = [
    ...new Set(calls.filter((call, index) => calls.indexOf(call) !== index)),
  ];

  return {
    repeated_read: {
      flagged: repeated.length > 0,
      reason:
        repeated.length > 0
          ? `called more than once with the same input: ${repeated.join(", ")}`
          : "no call repeated with the same input",
    },
  };
};

const agentTraceNoul = Schema.Struct({
  noul: Schema.Finite.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(1)
  ),
});

const agentTraceJevAnswersSchema = Schema.Struct({
  answers: Schema.Struct({
    no_result: agentTraceNoul,
    count_mismatch: agentTraceNoul,
    error_explained: agentTraceNoul,
  }),
});

const agentTraceContext =
  "`answer` is what the app's agent wrote to the user, in the user's language. `user_message` is what the user asked. `tool_results` is every tool the agent called for this answer, in order, with its input and what it returned.";

const agentTraceQuestions = {
  no_result: {
    type: "noul",
    instructions: `${agentTraceContext} Does \`answer\` end without giving the user anything for \`user_message\`: no result, no done action, no clear statement that nothing was found or why it could not be done, and no question back to the user? An answer that only says what it is about to do counts as giving nothing.`,
  },
  count_mismatch: {
    type: "noul",
    instructions: `${agentTraceContext} Does \`answer\` state a count, number or price that disagrees with \`tool_results\` (how many items a tool returned, a price, a total)? Numbers from \`user_message\` and rounding are not disagreements.`,
  },
  error_explained: {
    type: "noul",
    instructions: `${agentTraceContext} A tool in \`tool_results\` failed with an error code. Does \`answer\` tell the user, in plain words, what could not be done and why?`,
  },
} as const;

const agentTraceToolResults = (tools: readonly AgentTraceToolCall[]) => {
  const text = tools
    .map((tool) => `${tool.name}(${tool.input}) -> ${tool.output}`)
    .join("\n\n");

  return text.slice(-agentTraceToolOutputsMaxLength);
};

/**
 * Every judge's verdict on one trace.
 */
const judgeAgentTrace = Effect.fn("judgeAgentTrace")(function* judgeAgentTrace(
  trace: AgentTrace
) {
  const jev = yield* JevClient;

  const { answers } = yield* jev.ask(
    {
      model: jevNewestModel,
      state: {
        user_message: trace.userMessage.slice(0, 2000),
        answer: trace.answer,
        tool_results: agentTraceToolResults(trace.tools),
      },
      questions: agentTraceQuestions,
    },
    agentTraceJevAnswersSchema
  );

  const errored = agentTraceFailedTool(trace);

  const verdicts: AgentTraceVerdicts = {
    ...codeAgentTraceVerdicts(trace),
    no_result: {
      flagged: agentTraceFlagged(answers.no_result.noul),
      reason: `Jev: gives nothing ${answers.no_result.noul.toFixed(2)}`,
    },
    count_mismatch: {
      flagged: agentTraceFlagged(answers.count_mismatch.noul),
      reason: `Jev: a number disagrees ${answers.count_mismatch.noul.toFixed(2)}`,
    },
  };

  if (errored) {
    verdicts.tool_error_unexplained = {
      flagged: !agentTraceFlagged(answers.error_explained.noul),
      reason: `${errored.name} failed; Jev: explained ${answers.error_explained.noul.toFixed(2)}`,
    };
  }

  return verdicts;
});

const argumentValue = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);

  return index === -1 ? undefined : process.argv[index + 1];
};

// One answer for the owner to label: the message, the answer, the tools it
// called and each judge's verdict with a box to mark.
const agentTraceLabelSection = (
  trace: AgentTrace,
  verdicts: AgentTraceVerdicts
) =>
  [
    `## ${trace.traceId}`,
    "",
    `**User:** ${trace.userMessage}`,
    "",
    `**Answer:**\n\n${trace.answer}`,
    "",
    `**Tools:** ${trace.tools.map((tool) => tool.name).join(", ") || "none"}`,
    "",
    ...Object.entries(verdicts).map(
      ([name, verdict]) =>
        `- ${name}: ${verdict.flagged ? "FLAGGED" : "ok"} (${verdict.reason}). Right? [ ] yes [ ] no`
    ),
    "",
  ].join("\n");

const judgeAgentTraces = Effect.gen(function* judgeAgentTraces() {
  const environment = argumentValue("environment") ?? "development";

  const since =
    argumentValue("since") ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const limit = Number(argumentValue("limit") ?? "50");
  const write = process.argv.includes("--write-scores");
  const labelFile = argumentValue("label-file");
  const traces = yield* readAgentTraces({ environment, since, limit });
  const labelSections: string[] = [];

  for (const trace of traces) {
    const verdicts = yield* judgeAgentTrace(trace);
    labelSections.push(agentTraceLabelSection(trace, verdicts));

    const flagged = Object.entries(verdicts).filter(
      ([, verdict]) => verdict.flagged
    );

    const flags = flagged
      .map(([name, verdict]) => `${name} (${verdict.reason})`)
      .join("; ");

    yield* Effect.log(
      `${trace.traceId} ${flagged.length === 0 ? "ok" : flags}`
    );

    if (write) {
      yield* writeAgentTraceScores(trace.traceId, environment, verdicts);
    }
  }

  if (labelFile !== undefined) {
    writeFileSync(
      labelFile,
      [
        `# Judge labels: ${environment} since ${since}`,
        "",
        "Mark each verdict: is it right about this answer?",
        "",
        ...labelSections,
      ].join("\n")
    );
  }

  const jevTokens = (yield* Metric.value(jevInputTokens)).count;
  yield* Effect.log(
    `Judged ${traces.length} answers in ${environment} since ${since}${write ? ", scores written" : ""}; Jev ${jevTokens} input tokens, $${(jevTokens * jevInputPriceUsd).toFixed(4)}`
  );
});

if (import.meta.main) {
  await Effect.runPromise(
    judgeAgentTraces.pipe(Effect.provide(JevClient.layer))
  );
}
