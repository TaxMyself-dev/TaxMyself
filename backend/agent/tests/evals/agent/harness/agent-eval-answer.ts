import type { ModelMessage } from "ai";
import { ToolCall } from "deepeval/test-case";
import { Option, Schema } from "effect";

import { findAgentAnswerViolations } from "@/agent/core/turn/agent-answer-check";
import {
  agentAnswerAsksUser,
  writeAgentFollowUpQuestions,
} from "@/agent/core/turn/agent-follow-up-questions";
import {
  agentTurnEndedAnswer,
  createAgentStopHooks,
} from "@/agent/core/turn/agent-stop-hooks";
import { traceLangfuseAgentAnswer } from "@/server/integrations/langfuse-tracing.server";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import {
  agentTurnAnswerText,
  agentTurnUserText,
} from "../../../../src/agent/core/turn/agent-turn-text";
import { recordAgentEvalGeneration } from "../../runner/eval-run-recorder";
import type { createAgentEvalDatabase } from "./agent-eval-database";
import type { AgentEvalWrite } from "./agent-eval-fixtures";
import { evalUserId } from "./agent-eval-fixtures";
import {
  agentEvalTraceAttributes,
  createEvalAgent,
} from "./agent-eval-scenario";
import type { AgentEvalScenario } from "./agent-eval-scenario";

// One answer in an agent eval (runEvalMessages, agent-eval-harness.ts): the
// agent run as the chat runs it, and what the judges read of it (its tool
// calls, its words and the follow-up buttons), recorded for the report.

// An askUserQuestion card as the user sees it: the question, then its options.
const agentEvalQuestionText = ({
  question,
  options,
}: {
  question: string;
  options: readonly string[];
}) => [question, ...options.map((option) => `- ${option}`)].join("\n");

// An askUserQuestion card's question and answers, as the call holds them.
const agentEvalQuestionInput = Schema.decodeUnknownOption(
  Schema.Struct({
    question: Schema.String,
    options: Schema.Array(Schema.String),
  })
);

/**
 * Runs the agent on the conversation so far as the chat runs an answer: the
 * stop hooks may send it back with a note, and an answer that ended gets
 * its follow-up questions; in its Langfuse trace.
 *
 * @param scenario - The case.
 * @param messages - The conversation so far, as the model reads it.
 * @param input - The user's step, as the judges read it.
 * @param supabase - The case's database.
 * @param writes - Where the case's stores record what the agent changed.
 * @returns The answer's steps, content, usage and follow-ups, and how long it took.
 */
export const generateAgentEvalAnswer = async (
  scenario: AgentEvalScenario,
  messages: ModelMessage[],
  input: string,
  supabase: ReturnType<typeof createAgentEvalDatabase>,
  writes: AgentEvalWrite[]
) => {
  // The user's words without the <message_time> line the model reads; an
  // answer continued after approvals has none, as in the chat.
  const { agent, model, traceIntegrations } = await createEvalAgent(
    scenario,
    supabase,
    messages.at(-1)?.role === "user"
      ? input.replace(/^<message_time>.*<\/message_time>\n?/u, "")
      : "",
    writes
  );

  // As the chat runs an answer (agent-chat-turn-stream.server.ts): the stop
  // hooks may send the agent back with a note, and an answer that ended
  // gets its follow-up questions.
  const stopHooks = createAgentStopHooks(
    async (check) =>
      await appRuntime.runPromise(findAgentAnswerViolations(check))
  );

  const started = performance.now();

  const result = await traceLangfuseAgentAnswer(
    agentEvalTraceAttributes(),
    input,
    async (finishTrace) => {
      type EvalAgentRun = Awaited<ReturnType<typeof agent.generate>>;

      // Each run answers the turn so far; a hook's note decides whether
      // another follows, so the runs go one at a time.
      const answerTurn = async (
        prompt: ModelMessage[],
        earlierRuns: EvalAgentRun[]
      ): Promise<{
        prompt: ModelMessage[];
        runs: EvalAgentRun[];
        last: EvalAgentRun;
      }> => {
        const run = await agent.generate({ messages: prompt });
        const runs = [...earlierRuns, run];
        const turn = [...prompt, ...run.responseMessages];

        const note = await stopHooks(
          runs.flatMap((each) => each.steps),
          turn
        );

        return note === null
          ? { prompt: turn, runs, last: run }
          : await answerTurn([...turn, note], runs);
      };

      const { prompt, runs, last } = await answerTurn(messages, []);

      const steps = runs.flatMap((run) => run.steps);
      const answer = agentTurnAnswerText(steps);

      const followUps =
        agentTurnEndedAnswer(steps) && !agentAnswerAsksUser(answer)
          ? await appRuntime.runPromise(
              writeAgentFollowUpQuestions({
                model,
                userId: evalUserId,
                userMessage: agentTurnUserText(prompt),
                answer,
                integrations: traceIntegrations,
              })
            )
          : [];

      finishTrace(answer);

      return {
        steps,
        content: last.content,
        response: { modelId: last.finalStep.response.modelId },
        totalUsage: {
          inputTokens: runs.reduce(
            (sum, run) => sum + (run.usage.inputTokens ?? 0),
            0
          ),
          outputTokens: runs.reduce(
            (sum, run) => sum + (run.usage.outputTokens ?? 0),
            0
          ),
          cachedInputTokens: runs.reduce(
            (sum, run) =>
              sum + (run.usage.inputTokenDetails.cacheReadTokens ?? 0),
            0
          ),
          reasoningTokens: runs.reduce(
            (sum, run) =>
              sum + (run.usage.outputTokenDetails.reasoningTokens ?? 0),
            0
          ),
        },
        // The stop hooks' notes stay in the conversation, as the chat saves
        // them (data-agentNote).
        responseMessages: prompt.slice(messages.length),
        followUps: [...followUps],
      };
    }
  );

  return { result, latencyMs: performance.now() - started };
};

/**
 * The answer as generateAgentEvalAnswer gives it.
 */
type AgentEvalAnswer = Awaited<
  ReturnType<typeof generateAgentEvalAnswer>
>["result"];

/**
 * Each tool call that failed, with its error's text. A tool that throws
 * becomes a tool-error part the agent answers around (AI SDK 7).
 *
 * @param result - The answer.
 * @returns The failed calls.
 */
export const agentEvalToolErrors = (result: AgentEvalAnswer) =>
  result.steps.flatMap((step) =>
    step.content.flatMap((part) =>
      part.type === "tool-error"
        ? [
            {
              toolCallId: part.toolCallId,
              message:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            },
          ]
        : []
    )
  );

/**
 * The answer's tool calls as the judges read them: a failed call's error as
 * its output.
 *
 * @param result - The answer.
 * @param toolErrors - Its failed calls (agentEvalToolErrors).
 * @returns The calls, in order.
 */
export const agentEvalToolCalls = (
  result: AgentEvalAnswer,
  toolErrors: ReturnType<typeof agentEvalToolErrors>
) =>
  result.steps.flatMap((step) =>
    step.toolCalls.map((call) => {
      const executed = step.toolResults.find(
        (item) => item.toolCallId === call.toolCallId
      );

      const failed = toolErrors.find(
        (error) => error.toolCallId === call.toolCallId
      );

      const executedOutput: unknown = executed?.output;

      return new ToolCall({
        name: call.toolName,
        inputParameters: Schema.decodeUnknownSync(
          Schema.Record(Schema.String, Schema.Json)
        )(call.input),
        // The judges see a failed call's error as its output.
        output: failed ? { error: failed.message } : executedOutput,
      });
    })
  );

/**
 * Every step's text, as the chat shows it, with the question and answers
 * of an askUserQuestion card where it shows: the agent's own words.
 *
 * @param result - The answer.
 * @returns The text.
 */
export const agentEvalAnswerText = (result: AgentEvalAnswer) =>
  result.steps
    .flatMap((step) => [
      step.text.trim(),
      ...step.toolCalls.flatMap((call) =>
        call.toolName === "askUserQuestion"
          ? Option.toArray(agentEvalQuestionInput(call.input)).map((question) =>
              agentEvalQuestionText(question)
            )
          : []
      ),
    ])
    .filter(Boolean)
    .join("\n\n");

/**
 * The answer, then the follow-up buttons under it, which a separate call
 * writes in the user's voice: what the judges read as the output.
 *
 * @param answer - The agent's own words.
 * @param followUps - The follow-up questions.
 * @returns The output.
 */
export const agentEvalOutput = (answer: string, followUps: readonly string[]) =>
  [
    answer,
    ...(followUps.length > 0
      ? [
          [
            "Follow-up buttons under the answer:",
            ...followUps.map((question) => `- ${question}`),
          ].join("\n"),
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * Records the run for the eval report: its input and output, each model
 * call then the tools it called, the model, its usage and latency.
 *
 * @param run - The run's input, output, tool calls, answer, failed calls and
 *   latency.
 */
export const recordAgentEvalAnswer = ({
  input,
  output,
  toolCalls,
  result,
  toolErrors,
  latencyMs,
}: {
  input: string;
  output: string;
  toolCalls: ReturnType<typeof agentEvalToolCalls>;
  result: AgentEvalAnswer;
  toolErrors: ReturnType<typeof agentEvalToolErrors>;
  latencyMs: number;
}) => {
  recordAgentEvalGeneration({
    input,
    output,
    toolsCalled: toolCalls.map((call) => {
      const toolOutput: unknown = call.output;

      return {
        name: call.name,
        input: call.inputParameters,
        output: toolOutput,
      };
    }),
    // Each model call, then the tools it called, in order.
    steps: result.steps.flatMap((step, index) => [
      {
        type: "llm" as const,
        name: `step ${index + 1}`,
        output: step.text,
        model: step.response.modelId,
        input_tokens: step.usage.inputTokens ?? null,
        output_tokens: step.usage.outputTokens ?? null,
      },
      ...step.toolCalls.map((call) => ({
        type: "tool" as const,
        name: call.toolName,
        input: call.input,
        output:
          step.toolResults.find(
            (executed) => executed.toolCallId === call.toolCallId
          )?.output ??
          toolErrors.find((error) => error.toolCallId === call.toolCallId) ??
          null,
      })),
    ]),
    model: result.response.modelId,
    usage: {
      input_tokens: result.totalUsage.inputTokens,
      output_tokens: result.totalUsage.outputTokens,
      cached_input_tokens: result.totalUsage.cachedInputTokens,
      reasoning_tokens: result.totalUsage.reasoningTokens,
    },
    latencyMs,
  });
};
