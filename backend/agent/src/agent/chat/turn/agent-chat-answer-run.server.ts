import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { LanguageModelUsage } from "ai";
import { DateTime, Effect } from "effect";

import { writeStoredAgentChatMessages } from "@/agent/chat/messages/agent-chat-message-storage.server";
import { agentChatModelHistory } from "@/agent/chat/messages/agent-chat-model-history";
import type { maintainAgentChatAnswer } from "@/agent/chat/turn/agent-chat-answer-lease.server";
import { saveAgentChatAnswerStream } from "@/agent/chat/turn/agent-chat-answer-stream.server";
import { agentChatErrorMessage } from "@/agent/chat/turn/agent-chat-errors";
import { createAgentChatPageData } from "@/agent/chat/turn/agent-chat-page-data";
import type { agentChatRequestSchema } from "@/agent/chat/turn/agent-chat-request.server";
import { streamAgentChatTurn } from "@/agent/chat/turn/agent-chat-turn-stream.server";
import type { createAgentChatUserSteers } from "@/agent/chat/turn/agent-chat-user-steers.server";
import { createAppAgent } from "@/agent/core/agent/app-agent";
import { AgentLanguageModel } from "@/agent/core/model/agent-model";
import { recordAgentUsage } from "@/agent/core/model/agent-usage.server";
import { AgentToolError } from "@/agent/core/tool-runtime/agent-tool-error-next-step";
import { findAgentAnswerViolations } from "@/agent/core/turn/agent-answer-check";
import { writeAgentFollowUpQuestions } from "@/agent/core/turn/agent-follow-up-questions";
import { createAgentStopHooks } from "@/agent/core/turn/agent-stop-hooks";
import type { AgentTurnSignals } from "@/agent/core/turn/agent-turn-signals";
import { agentShortTermHistory } from "@/agent/memory/short-term-memory.server";
import { withAgentSkillList } from "@/agent/skills/registry/agent-skills";
import { agentChatMessageText } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";
import {
  createTaskOpportunityStore,
  createTrackingTaskStore,
  emailSender,
  webSearch,
} from "@/server/agent-ports.server";
import {
  langfuseIntegrations,
  traceLangfuseAgentAnswer,
} from "@/server/integrations/langfuse-tracing.server";
import {
  appRuntime,
  flushAppTelemetry,
  keepAppRequestAlive,
} from "@/server/runtime/app-runtime.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

// Running one answer once its conversation is opened (answerAgentChatRequest,
// agent-chat-response.server.ts): the agent in its Langfuse trace, the
// answer saved when it ends with its usage and follow-up questions, and the
// UI message stream the channel reads.

/**
 * One answer's request: the conversation, the newest message, and the
 * user's language.
 */
export type AgentChatRequest = typeof agentChatRequestSchema.Type;

/**
 * What a channel other than the page (a messaging app) needs from an
 * answer: the answer as saved, once it is, and its follow-up questions once
 * written, none when it gets none, so it can send them on. The chat page
 * needs none of them.
 */
export interface AgentChatAnswerHooks {
  readonly onAnswerSaved?: (message: AgentChatMessage) => Promise<void>;
  readonly onFollowUps?: (questions: readonly string[]) => Promise<void>;
  // The longest follow-up question the channel's buttons show (a messaging
  // app's reply buttons can be as short as 20 characters); the chat page's
  // wrap.
  readonly followUpMaxLength?: number;
}

// An answer's follow-up questions, saved with it as its data-followUps part
// once written, and returned; an answer that gets none stays as saved. A
// failed save is logged: the answer stands without its buttons.
const saveAgentFollowUpQuestions = Effect.fn("saveAgentFollowUpQuestions")(
  function* saveAgentFollowUpQuestions(
    supabase: UserSupabaseClient,
    conversationId: string,
    {
      answerMessage,
      ...input
    }: Parameters<typeof writeAgentFollowUpQuestions>[0] & {
      answerMessage: AgentChatMessage;
    }
  ) {
    const questions = yield* writeAgentFollowUpQuestions(input);

    if (questions.length === 0) {
      return questions;
    }

    yield* writeStoredAgentChatMessages(supabase, conversationId, [
      {
        ...answerMessage,
        parts: [
          ...answerMessage.parts,
          { type: "data-followUps", data: { questions: [...questions] } },
        ],
      },
    ]).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logError("AGENT_FOLLOW_UPS_SAVE_FAILED", error),
        onSuccess: () => Effect.void,
      })
    );

    return questions;
  }
);

// Hands the written follow-ups to the channel (onFollowUps), once saved.
const tellAgentFollowUps =
  (hooks: AgentChatAnswerHooks) => (questions: readonly string[]) =>
    Effect.promise(async () => await hooks.onFollowUps?.(questions));

// A saved answer that did not save is logged; the answer still reaches the
// user.
const logAgentChatAnswerSaveFailure = (error: SupabaseQueryError) =>
  Effect.logError("AGENT_CHAT_ANSWER_SAVE_FAILED", error);

/**
 * What running an answer needs once its conversation is opened and read:
 * the request kept alive for its saving, the user's client, the request's
 * body, the channel's hooks, the answer's stream, the conversation as the
 * model reads it, the user's settings, Jev's turn signals, the steers the
 * user sends while it runs, the signal that stops it, and the lease's
 * release.
 */
interface AgentChatAnswerRun {
  readonly request: Request;
  readonly supabase: UserSupabaseClient;
  readonly body: AgentChatRequest;
  readonly hooks: AgentChatAnswerHooks;
  readonly streamId: string;
  readonly validated: AgentChatMessage[];
  readonly settings: UserSettings;
  readonly turnSignals: AgentTurnSignals;
  readonly userSteers: ReturnType<typeof createAgentChatUserSteers>;
  readonly answerSignal: AbortSignal;
  readonly releaseAnswer: Effect.Success<
    ReturnType<typeof maintainAgentChatAnswer>
  >;
}

/**
 * Runs the agent on an opened conversation and returns its answer as a UI
 * message stream response: the agent in its Langfuse trace, the answer
 * saved when it ends (with its usage, the channel's onAnswerSaved, and its
 * follow-up questions after), and a failure told to the user in their
 * words. The stream is read to its end and saved for a page that opens
 * again, then the conversation is freed (releaseAnswer).
 *
 * @param run - The opened answer (AgentChatAnswerRun).
 * @returns The answer's response.
 */
export const streamAgentChatAnswer = Effect.fn("streamAgentChatAnswer")(
  function* streamAgentChatAnswer(run: AgentChatAnswerRun) {
    const {
      request,
      supabase,
      body,
      hooks,
      streamId,
      validated,
      settings,
      turnSignals,
      userSteers,
      answerSignal,
      releaseAnswer,
    } = run;

    const { userId } = body;

    const now = DateTime.formatIso(yield* DateTime.now);
    const { model } = yield* AgentLanguageModel;
    const traceIntegrations = yield* langfuseIntegrations;
    const continuing = validated.at(-1)?.role === "assistant";

    // A continued answer (after an approval) keeps the time it started.
    const answerCreatedAt = continuing
      ? (validated.at(-1)?.metadata?.createdAt ?? now)
      : now;

    const stepUsages: LanguageModelUsage[] = [];
    const page = createAgentChatPageData();

    // Runs the answer inside its Langfuse trace; finishTrace records its text.
    const runAgentChatAnswer = async (finishTrace: (output: string) => void) =>
      await streamAgentChatTurn({
        agent: createAppAgent({
          conversationId: body.id,
          userId,
          model,
          supabase,
          settings,
          // The tools' ports (agent-ports.server.ts).
          tasks: createTrackingTaskStore(supabase),
          opportunities: createTaskOpportunityStore(supabase),
          webSearch,
          email: emailSender,
          locale: body.locale ?? "en",
          pageData: page.pageData,
          traceIntegrations,
          turnSignals,
          userSteers,
        }),
        history: withAgentSkillList(
          agentChatModelHistory(agentShortTermHistory(validated))
        ),
        originalMessages: validated,
        userSteers,
        // The stop button aborts the request, and with it the agent.
        abortSignal: answerSignal,
        // createdAt when a new answer starts; finishedAt each time it
        // ends (an answer continued after an approval ends again), for
        // its "עבד במשך" line (agent-chat-work-log.tsx).
        startMetadata: continuing ? undefined : { createdAt: now },
        finishMetadata: () => ({
          createdAt: answerCreatedAt,
          finishedAt: DateTime.formatIso(DateTime.nowUnsafe()),
        }),
        stopHooks: createAgentStopHooks(
          async (input) =>
            await appRuntime.runPromise(findAgentAnswerViolations(input))
        ),
        onStepEnd: (usage) => {
          stepUsages.push(usage);
        },
        // An AI SDK callback: the saving runs as its own Effect here.
        // The follow-ups are written once the answer is saved, without
        // holding it: the page fetches them (GET .../follow-ups).
        onEnd: async (responseMessage, followUps) => {
          finishTrace(agentChatMessageText(responseMessage));

          await appRuntime.runPromise(
            writeStoredAgentChatMessages(supabase, body.id, [
              responseMessage,
            ]).pipe(
              Effect.matchEffect({
                onFailure: logAgentChatAnswerSaveFailure,
                onSuccess: Effect.succeed,
              }),
              Effect.andThen(
                recordAgentUsage(supabase, body.id, "answer", stepUsages)
              )
            )
          );

          await hooks.onAnswerSaved?.(responseMessage);

          if (followUps === null) {
            await hooks.onFollowUps?.([]);
          } else {
            keepAppRequestAlive(
              request,
              appRuntime.runPromise(
                saveAgentFollowUpQuestions(supabase, body.id, {
                  model,
                  userId,
                  ...(hooks.followUpMaxLength !== undefined && {
                    maxLength: hooks.followUpMaxLength,
                  }),
                  integrations: traceIntegrations,
                  answerMessage: responseMessage,
                  ...followUps,
                }).pipe(
                  Effect.tap(tellAgentFollowUps(hooks)),
                  Effect.ensuring(flushAppTelemetry)
                )
              )
            );
          }
        },
        // The AI SDK asks this for a failed tool call's text too: a
        // tool's failure keeps its own text (AgentToolError), which
        // later turns read; only the answer's own failure is logged
        // and told to the user in their words.
        onError: (error) => {
          if (error instanceof AgentToolError) {
            return error.message;
          }

          appRuntime.runFork(
            Effect.logError("AGENT_CHAT_STREAM_FAILED", error)
          );

          return agentChatErrorMessage(error, body.locale ?? "en");
        },
      });

    // The answer's stream, built before the response so a bad request still
    // fails here; the response stream below adds the page data to it. Its
    // Langfuse trace is grouped by user and conversation; an answer
    // continued after the user's approval decisions has no new words.
    const answer = yield* Effect.promise(
      async () =>
        await traceLangfuseAgentAnswer(
          {
            traceName: "agent-chat-answer",
            userId,
            sessionId: body.id,
            tags: ["agent-chat"],
            metadata: { locale: body.locale ?? "en" },
          },
          continuing
            ? "(continued after the user's approval decisions)"
            : agentChatMessageText(validated.at(-1)),
          runAgentChatAnswer
        )
    );

    return createUIMessageStreamResponse({
      stream: createUIMessageStream<AgentChatMessage>({
        execute: ({ writer }) => {
          page.connect(writer);
          writer.merge(answer);
        },
        onError: (error) => {
          appRuntime.runFork(
            Effect.logError("AGENT_CHAT_STREAM_FAILED", error)
          );

          return agentChatErrorMessage(error, body.locale ?? "en");
        },
      }),
      // Reads the answer to its end, saving its events for a page that
      // opens again, so onEnd saves it even when the page closed; then
      // frees the conversation for the next answer and sends the answer's
      // telemetry, with the function kept running until both are done.
      consumeSseStream: async ({ stream }) => {
        const consumed = appRuntime.runPromise(
          Effect.promise(async () => {
            await saveAgentChatAnswerStream(
              supabase,
              body.id,
              streamId,
              stream
            );
          }).pipe(
            Effect.ensuring(releaseAnswer),
            Effect.ensuring(flushAppTelemetry)
          )
        );

        keepAppRequestAlive(request, consumed);

        await consumed;
      },
    });
  }
);
