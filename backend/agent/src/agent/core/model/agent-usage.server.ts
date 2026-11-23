import type { LanguageModelUsage } from "ai";
import { Effect } from "effect";

import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

import { agentModelId } from "./agent-model";

// What the agent's model calls used (agent_usage), so cost and the prompt
// cache's hit rate can be read from the database: one row per chat answer
// (adding up its steps) or chat title; rows of kind "summary" are from
// conversation summaries, written until 2026-10-17. Recording never
// fails the call it describes; a lost row is only logged.

type AgentUsageKind = "answer" | "title";

/**
 * Records the tokens one answer or title used, for the user's usage
 * limits.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation the usage belongs to.
 * @param kind - What the usage was for.
 * @param usages - The usage of each model step.
 */
export const recordAgentUsage = Effect.fn("recordAgentUsage")(
  function* recordAgentUsage(
    supabase: UserSupabaseClient,
    conversationId: string,
    kind: AgentUsageKind,
    usages: LanguageModelUsage[]
  ): Effect.fn.Return<void> {
    if (usages.length === 0) {
      return;
    }

    const total = { input: 0, cached: 0, output: 0, reasoning: 0 };

    for (const usage of usages) {
      total.input += usage.inputTokens ?? 0;
      total.cached += usage.inputTokenDetails.cacheReadTokens ?? 0;
      total.output += usage.outputTokens ?? 0;
      total.reasoning += usage.outputTokenDetails.reasoningTokens ?? 0;
    }

    yield* runSupabaseQuery("AGENT_USAGE_WRITE_FAILED", () =>
      supabase.from("agent_usage").insert({
        conversation_id: conversationId,
        kind,
        model: agentModelId,
        steps: usages.length,
        input_tokens: total.input,
        cached_input_tokens: total.cached,
        output_tokens: total.output,
        reasoning_tokens: total.reasoning,
      })
    ).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logError("AGENT_USAGE_WRITE_FAILED", error),
        onSuccess: Effect.succeed,
      })
    );
  }
);
