import { generateText, Output } from "ai";
import type { Telemetry } from "ai";
import { Effect, Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import type { AgentLanguageModel } from "../model/agent-model";
import { agentOpenAiPrivacyOptions } from "../model/agent-openai-privacy";

// The questions the user may ask next, shown as buttons under an answer.
// They are written after the answer ends, by a short call of their own, as
// ChatGPT and Perplexity write theirs, not by the agent: the agent was asked
// for them with every answer and left them out of 11 of 28 development
// answers and of every app question (2026-10-14). The chat saves them as the
// answer's data-followUps part; an answer that asks the user something gets
// none, since their reply comes next.

// The longest question kept; the chat page's buttons wrap.
const agentFollowUpQuestionMax = 120;

// The answer has streamed already; the buttons wait at most this long.
const agentFollowUpQuestionsTimeout = "8 seconds";

const agentFollowUpQuestionsSchema = Schema.Struct({
  questions: Schema.Array(Schema.String).annotate({
    description:
      "Two or three questions the user might ask next, in the user's voice and language, 2 to 12 words each; none when no good one fits",
  }),
});

/**
 * Whether the answer asks the user something in its last paragraph, so
 * their reply comes next ("מה אתם מציעים? כך אחפש..." asks mid-paragraph).
 *
 * @param answer - The answer's text.
 * @returns Whether its last paragraph holds a question mark.
 */
export const agentAnswerAsksUser = (answer: string) =>
  /[?？]/u.test(
    answer
      .trim()
      .split(/\n\s*\n/u)
      .at(-1) ?? ""
  );

// The follow-ups' own model call failed; the answer ends without buttons.
class AgentFollowUpQuestionsError extends Schema.TaggedError<
  AgentFollowUpQuestionsError,
  { readonly brand: unique symbol }
>()("AgentFollowUpQuestionsError", { cause: Schema.Defect() }) {}

interface AgentFollowUpQuestionsInput {
  model: AgentLanguageModel["Service"]["model"];
  userId: string;
  userMessage: string;
  answer: string;
  abortSignal?: AbortSignal;
  // The longest a question may be, when it must fit a button (a messaging
  // channel's reply buttons, as short as 20 characters); a longer one is
  // dropped.
  maxLength?: number;
  // Langfuse's integrations, when the app traces.
  integrations?: readonly Telemetry[];
}

/**
 * Up to three questions; none when the call fails or runs late
 * (AGENT_FOLLOW_UPS_FAILED): the answer stands without its buttons.
 */
export const writeAgentFollowUpQuestions = Effect.fn(
  "writeAgentFollowUpQuestions"
)(
  function* writeAgentFollowUpQuestions(input: AgentFollowUpQuestionsInput) {
    const { output } = yield* Effect.tryPromise({
      try: async (signal) =>
        await generateText({
          model: input.model,
          maxRetries: 0,
          abortSignal: AbortSignal.any([
            signal,
            ...(input.abortSignal ? [input.abortSignal] : []),
          ]),
          telemetry: {
            functionId: "agent-follow-up-questions",
            integrations: [...(input.integrations ?? [])],
          },
          providerOptions: {
            openai: {
              reasoningEffort: "low",
              ...agentOpenAiPrivacyOptions(input.userId),
            },
          },
          output: Output.object({
            schema: toStandardSchema(agentFollowUpQuestionsSchema),
          }),
          instructions:
            "Suggest what the user of YourApp's agent might ask next, after the answer below: two or three short questions in the user's voice and language (2 to 12 words each), each following from this answer (the next step on what it found or did, not a tour of the app) and something the agent can do: manage tasks, search the web, write and send emails [list your agent's abilities]. A wrong or generic question is worse than none. When the answer asks the user for something, as a question or as a request (write, tell, send), return none: their reply comes next. Never write a placeholder such as [business type].",
          prompt: `${
            input.maxLength === undefined
              ? ""
              : `Each question is a button label: at most ${input.maxLength} characters, about 2 to 4 words.\n\n`
          }The user wrote:\n${input.userMessage.slice(0, 2000)}\n\nThe agent answered:\n${input.answer.slice(0, 6000)}`,
        }),
      catch: (cause) => new AgentFollowUpQuestionsError({ cause }),
    }).pipe(Effect.timeout(agentFollowUpQuestionsTimeout));

    return output.questions
      .flatMap((question) => {
        const trimmed = question.trim();

        return trimmed.length > 0 &&
          trimmed.length <= (input.maxLength ?? agentFollowUpQuestionMax)
          ? [trimmed]
          : [];
      })
      .slice(0, 3);
  },
  Effect.catchCause((cause) =>
    Effect.logWarning("AGENT_FOLLOW_UPS_FAILED", cause).pipe(
      Effect.as<readonly string[]>([])
    )
  )
);
