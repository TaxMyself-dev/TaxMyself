import { DateTime, Effect, Fiber, Schedule } from "effect";

import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";

// One answer at a time per conversation, as Codex runs one turn at a time
// per session: a second request (another tab, a double send) while the agent
// answers is turned away instead of answering from the same history twice.
// The lease is agent_chat_conversations.answering_until; one update both
// checks and takes it, so two requests cannot both win.

// Renewed while an answer runs; a crashed server's lease expires after this.
const agentChatAnswerLeaseMs = 5 * 60_000;

interface AgentChatAnswerLease {
  conversationId: string;
  expiresAt: string;
}

// Moves the conversation's lease to agentChatAnswerLeaseMs after now; callers
// add the condition that makes the update a claim or a renewal.
const extendAgentChatAnswerLease = (
  supabase: UserSupabaseClient,
  conversationId: string,
  now: DateTime.Utc
) =>
  supabase
    .from("agent_chat_conversations")
    .update({
      answering_until: DateTime.formatIso(
        DateTime.add(now, { milliseconds: agentChatAnswerLeaseMs })
      ),
    })
    .eq("id", conversationId);

/**
 * Opens an answer in one round trip (claim_agent_chat_answer): creates the
 * conversation with its first message when missing, takes its answering
 * lease, and marks the answer's stream active. busy when another answer
 * holds the lease; missing when the conversation is someone else's (RLS
 * hides it). Before 2026-10-17 these were four calls one after another,
 * about 0.3 s of every message before the model started.
 *
 * @param supabase - The user's Supabase client.
 * @param answer - The conversation, its name and pin (stored with its first
 *   message), and the answer's stream.
 */
export const claimAgentChatAnswer = Effect.fn("claimAgentChatAnswer")(
  function* claimAgentChatAnswer(
    supabase: UserSupabaseClient,
    answer: {
      conversationId: string;
      name: string | null;
      pinned: boolean;
      streamId: string;
    }
  ): Effect.fn.Return<
    AgentChatAnswerLease | "busy" | "missing",
    SupabaseQueryError
  > {
    const { data } = yield* runSupabaseQuery("AGENT_CHAT_LEASE_FAILED", () =>
      supabase.rpc("claim_agent_chat_answer", {
        chat_id: answer.conversationId,
        chat_name: answer.name,
        chat_pinned: answer.pinned,
        answer_stream_id: answer.streamId,
        lease_seconds: agentChatAnswerLeaseMs / 1000,
      })
    );

    const [row] = data;

    if (row?.status === "claimed" && isNonEmptyText(row.answering_until)) {
      return {
        conversationId: answer.conversationId,
        expiresAt: row.answering_until,
      };
    }

    return row?.status === "busy" ? "busy" : "missing";
  }
);

/**
 * Renew with the exact value returned by Postgres. A lost lease cannot be
 * reclaimed here, or release the next answer's lease.
 */
export const renewAgentChatAnswer = Effect.fn("renewAgentChatAnswer")(
  function* renewAgentChatAnswer(
    supabase: UserSupabaseClient,
    lease: AgentChatAnswerLease
  ): Effect.fn.Return<boolean, SupabaseQueryError> {
    const now = yield* DateTime.now;

    const { data } = yield* runSupabaseQuery("AGENT_CHAT_LEASE_FAILED", () =>
      extendAgentChatAnswerLease(supabase, lease.conversationId, now)
        .eq("answering_until", lease.expiresAt)
        .gt("answering_until", DateTime.formatIso(now))
        .select("answering_until")
    );

    const answeringUntil = data.at(0)?.answering_until;

    if (!isNonEmptyText(answeringUntil)) {
      return false;
    }

    lease.expiresAt = answeringUntil;

    return true;
  }
);

/**
 * Logged, not failed: the answer is already over, and the lease expires on
 * its own.
 */
export const releaseAgentChatAnswer = Effect.fn("releaseAgentChatAnswer")(
  function* releaseAgentChatAnswer(
    supabase: UserSupabaseClient,
    lease: AgentChatAnswerLease
  ): Effect.fn.Return<void> {
    yield* runSupabaseQuery("AGENT_CHAT_LEASE_RELEASE_FAILED", () =>
      supabase
        .from("agent_chat_conversations")
        .update({ answering_until: null })
        .eq("id", lease.conversationId)
        .eq("answering_until", lease.expiresAt)
    ).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logError("AGENT_CHAT_LEASE_RELEASE_FAILED", error),
        onSuccess: Effect.succeed,
      })
    );
  }
);

/**
 * Renews the lease every minute in a background fiber while the answer
 * streams; onLost runs when a renewal fails or finds the lease gone. Returns
 * the effect that ends the answer: it stops renewing, waiting for a renewal
 * already sent (renewals are uninterruptible, so the release below matches
 * the lease's latest expiry), then releases the lease.
 */
export const maintainAgentChatAnswer = Effect.fn("maintainAgentChatAnswer")(
  function* maintainAgentChatAnswer(
    supabase: UserSupabaseClient,
    lease: AgentChatAnswerLease,
    onLost: () => void
  ): Effect.fn.Return<Effect.Effect<void>> {
    const renewal = Effect.gen(function* renewAgentChatAnswerLease() {
      const renewed = yield* renewAgentChatAnswer(supabase, lease).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logError("AGENT_CHAT_LEASE_RENEW_FAILED", error).pipe(
              Effect.as(false)
            ),
          onSuccess: Effect.succeed,
        })
      );

      if (!renewed) {
        onLost();
      }
    }).pipe(Effect.uninterruptible);

    const renewing = yield* Effect.schedule(
      renewal,
      Schedule.spaced("60 seconds")
    ).pipe(Effect.forkDetach);

    // The caller runs this when the answer ends; it is the result, not a
    // step of this function.
    // @effect-diagnostics-next-line returnEffectInGen:off
    return Fiber.interrupt(renewing).pipe(
      Effect.andThen(releaseAgentChatAnswer(supabase, lease))
    );
  }
);
