import { Effect, Fiber } from "effect";

import {
  agentChatError,
  isAgentChatMessageStored,
  prepareAgentChatMessages,
} from "@/agent/chat/messages/agent-chat-message-preparation.server";
import {
  readStoredAgentChatMessages,
  writeStoredAgentChatMessages,
} from "@/agent/chat/messages/agent-chat-message-storage.server";
import {
  claimAgentChatAnswer,
  maintainAgentChatAnswer,
} from "@/agent/chat/turn/agent-chat-answer-lease.server";
import { streamAgentChatAnswer } from "@/agent/chat/turn/agent-chat-answer-run.server";
import type {
  AgentChatAnswerHooks,
  AgentChatRequest,
} from "@/agent/chat/turn/agent-chat-answer-run.server";
import {
  endAgentChatAnswerStream,
  registerAgentChatAnswerStream,
} from "@/agent/chat/turn/agent-chat-answer-stream.server";
import { agentChatSentText } from "@/agent/chat/turn/agent-chat-request.server";
import { createAgentChatUserSteers } from "@/agent/chat/turn/agent-chat-user-steers.server";
import {
  agentUserContextText,
  withAgentUserContext,
} from "@/agent/core/agent/agent-user-context";
import type { BusinessView } from "@/agent/core/ports/keepintax-ports";
import {
  noAgentTurnSignals,
  readAgentTurnSignals,
} from "@/agent/core/turn/agent-turn-signals";
import { readStoredAgentMemories } from "@/agent/memory/long-term-memory.server";
import {
  agentBusinessesSection,
  agentConversationBusinessState,
  withAgentBusinessContext,
} from "@/agent/tools/books/agent-conversation-business";
import {
  authorizeOnboardingSurface,
  profileConversationBusiness,
} from "@/agent/tools/profile/agent-profile-surface";
import { createKeepInTaxBooks } from "@/server/agent-ports.server";
import { currentAgentDomain } from "@/server/runtime/agent-request-context";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { readStoredUserSettings } from "@/server/user-data/user-settings-storage.server";

import {
  startJourneyStopwatch,
  recordJourneyTiming,
} from "../../../../backend/shared/observability/journey-timing";

// The agent chat's endpoint (POST /api/agent/chat). The conversation lives on
// the server: the page sends only its newest message, which is either the
// user's new message or the agent's last message with the user's approval
// decisions. The answer streams back as a UI message stream and is saved
// when it ends. The answer keeps running when the page closes, and a page
// that opens again follows it (agent-chat-answer-stream.server.ts); the stop
// button ends it where it got to, and that much is saved. The answer itself
// (answerAgentChatRequest) is the same for every channel: the web page
// reaches it through respondToAgentChat (agent-chat-endpoint.server.ts);
// another channel (a messaging app) calls it with its own hooks.

// KeepInTax (2026-11-15): none, when the directory cannot be read.
const noBusinesses: readonly BusinessView[] = [];

/**
 * The data owner's businesses, read on the server for the verified user
 * before the model's first step (agent-conversation-business.ts). Without
 * KeepInTax's backend (the task worker, unit tests) or when the read fails,
 * none: the tools then fail with their own codes and the chat asks.
 *
 * @returns The businesses, or none.
 */
const readAgentBusinessDirectory = () =>
  createKeepInTaxBooks()
    .listBusinesses()
    .pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logWarning(
            "AGENT_BUSINESS_DIRECTORY_FAILED",
            error.message
          ).pipe(Effect.as(noBusinesses)),
        onSuccess: (directory) => Effect.succeed(directory.businesses),
      })
    );

/**
 * Times each step before the model starts, for the chat-server-prep
 * journey: mark records the time since the last mark under its name.
 */
export const startAgentChatPrepTiming = Effect.gen(
  function* startAgentChatPrepTiming() {
    const elapsed = yield* startJourneyStopwatch;
    const steps: Record<string, number> = {};
    let stepElapsed = elapsed;

    const mark = Effect.fnUntraced(function* markPrepStep(step: string) {
      steps[step] = yield* stepElapsed;
      stepElapsed = yield* startJourneyStopwatch;
    });

    return { elapsed, steps, mark };
  }
);

/**
 * The prep timing startAgentChatPrepTiming gives.
 */
export type AgentChatPrepTiming = Effect.Success<
  typeof startAgentChatPrepTiming
>;

/**
 * Answers one chat request for a signed-in user, whatever channel it came
 * from: opens the answer (the lease, the stream), reads the conversation,
 * runs the agent, and saves the answer when it ends. The response is the
 * answer's UI message stream, or an error response (busy, unknown
 * conversation, invalid messages). The request is the one the host keeps
 * running for the answer's saving (keepAppRequestAlive).
 *
 * @param request - The incoming request.
 * @param supabase - The user's client: every read and write runs under
 *   their RLS.
 * @param body - The conversation, newest message and language; its userId
 *   is the client's user.
 * @param prep - The prep timing the caller started.
 * @param hooks - What the channel needs from the answer.
 * @returns The answer's response.
 */
export const answerAgentChatRequest = Effect.fn("answerAgentChatRequest")(
  function* answerAgentChatRequest(
    request: Request,
    supabase: UserSupabaseClient,
    body: AgentChatRequest,
    prep: AgentChatPrepTiming,
    hooks: AgentChatAnswerHooks = {}
  ) {
    const { userId } = body;

    // Jev reads the user's new words (the turn signals) while the
    // conversation opens and its messages are read: they need nothing from
    // the database, and waiting for it added about 0.4 s before the model
    // started (chat-server-prep, 2026-10-16). An answer continued after
    // approvals has no new words.
    const sentText =
      body.message.role === "user" ? agentChatSentText(body.message.parts) : "";

    const turnSignalsRead = yield* Effect.forkChild(
      sentText === ""
        ? Effect.succeed(noAgentTurnSignals)
        : readAgentTurnSignals(sentText)
    );

    // One round trip opens the answer: the conversation (created with its
    // first message), its lease and its stream (claimAgentChatAnswer).
    const streamId = crypto.randomUUID();

    const lease = yield* claimAgentChatAnswer(supabase, {
      conversationId: body.id,
      name: body.conversation.name,
      pinned: body.conversation.pinned,
      streamId,
    });

    yield* prep.mark("claimMs");

    if (lease === "missing") {
      return agentChatError(
        "AGENT_CHAT_NOT_FOUND",
        "Unknown conversation.",
        404
      );
    }

    if (lease === "busy") {
      return agentChatError(
        "AGENT_CHAT_BUSY",
        "The agent is still answering in this conversation.",
        409
      );
    }

    // Aborts the model's stream when the lease is lost. The stream outlives
    // this handler's scope, so a scope-managed Effect.abortSignal would end
    // every answer as soon as the response is returned.
    // @effect-diagnostics-next-line abortControllerInEffect:off
    const leaseAbort = new AbortController();

    const releaseAnswer = yield* maintainAgentChatAnswer(
      supabase,
      lease,
      () => {
        leaseAbort.abort();
      }
    );

    // From here the lease is held and the answer's stream is active: the
    // stream releases both when the answer ends, and every other way out
    // releases them below.
    let streaming = false;

    const stopSignal = registerAgentChatAnswerStream(
      supabase,
      body.id,
      streamId
    );

    const userSteers = createAgentChatUserSteers(supabase, body.id, streamId);

    return yield* Effect.gen(function* answerAgentChat() {
      // Read after the lease, so no other answer is still saving its messages.
      const [history, messageStored, settings, memories, directory] =
        yield* Effect.all(
          [
            readStoredAgentChatMessages(supabase, body.id),
            isAgentChatMessageStored(supabase, body.message.id),
            readStoredUserSettings(supabase, userId),
            readStoredAgentMemories(supabase),
            readAgentBusinessDirectory(),
          ],
          { concurrency: "unbounded" }
        );

      yield* prep.mark("readsMs");

      const prepared = yield* prepareAgentChatMessages(
        supabase,
        body,
        history,
        messageStored
      );

      yield* prep.mark("validateMs");

      if (prepared instanceof Response) {
        return prepared;
      }

      // The answer ends at the stop button or when the lease is lost, never
      // because the page closed.
      const answerSignal = AbortSignal.any([stopSignal, leaseAbort.signal]);

      // A new or retried user message carries the user context when it
      // changed since the last one (agent-user-context.ts).
      // KeepInTax (2026-11-15, business selection): the businesses a new
      // message names are recorded on it, and the conversation's business
      // is read from the stored messages (agent-conversation-business.ts).
      const surface = yield* Effect.tryPromise(async () => {
        const businessNumber = profileConversationBusiness(
          history,
          body.onboarding?.businessNumber
        );

        if (businessNumber !== undefined) {
          await authorizeOnboardingSurface(
            currentAgentDomain(),
            businessNumber
          );
        }

        return businessNumber;
      }).pipe(
        Effect.match({
          onFailure: () => ({ ok: false as const, businessNumber: null }),
          onSuccess: (businessNumber) => ({
            ok: true as const,
            businessNumber,
          }),
        })
      );

      if (!surface.ok) {
        return agentChatError(
          "AGENT_PROFILE_ACCESS",
          "Profile/interface is unavailable or belongs to another business.",
          403
        );
      }

      const onboardingBusiness = surface.businessNumber ?? undefined;

      if (onboardingBusiness !== undefined) {
        const last = prepared.at(-1);

        if (
          last &&
          !last.parts.some((part) => part.type === "data-onboardingContext")
        ) {
          last.parts.push({
            type: "data-onboardingContext",
            data: { businessNumber: onboardingBusiness },
          });
        }
      }

      const withBusinesses = withAgentBusinessContext(prepared, directory);

      const business = agentConversationBusinessState(
        directory,
        withBusinesses
      );

      if (onboardingBusiness !== undefined) {
        business.current = onboardingBusiness;
      }

      const onboardingContext = yield* Effect.promise(
        async () =>
          (await currentAgentDomain()?.readOnboardingContext?.(
            business.current
          )) ?? ""
      );

      const validated = withAgentUserContext(
        withBusinesses,
        agentUserContextText(
          settings,
          memories,
          agentBusinessesSection(directory, business.current) +
            onboardingContext
        )
      );

      // The user's message is kept even if the answer fails.
      const [, turnSignals] = yield* Effect.all(
        [
          writeStoredAgentChatMessages(supabase, body.id, validated.slice(-1)),
          Fiber.join(turnSignalsRead),
        ],
        { concurrency: "unbounded" }
      );

      yield* prep.mark("saveAndMemoryMs");
      yield* Effect.forkDetach(
        recordJourneyTiming({
          journey: "chat-server-prep",
          ms: yield* prep.elapsed,
          details: { ...prep.steps, messages: validated.length },
        })
      );

      const response = yield* streamAgentChatAnswer({
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
        business,
        onboardingBusiness,
      });

      streaming = true;

      return response;
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          if (streaming) {
            return Effect.void;
          }

          return releaseAnswer.pipe(
            Effect.andThen(
              endAgentChatAnswerStream(supabase, body.id, streamId)
            )
          );
        })
      )
    );
  }
);
