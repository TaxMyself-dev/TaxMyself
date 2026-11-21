import type { Telemetry } from "ai";
import { Effect, Metric, Option, Schema } from "effect";

import { recordProductEvent } from "@/server/integrations/posthog-product-events.server";
import { appRuntime } from "@/server/runtime/app-runtime.server";

// The agent's model calls and tool runs as metrics and logs, through the
// app's OTLP export (appObservabilityLive) to Grafana: an AI SDK telemetry
// integration (ai's Telemetry interface; no OpenTelemetry SDK), passed per
// agent so a dev reload does not register it twice. It records names,
// counts and timings only, never the conversation: no prompts, answers or
// tool inputs and outputs (those go to Langfuse, langfuse-tracing.server.ts).

const agentModelCalls = Metric.counter("agent_model_calls", {
  description: "Model calls the chat agent made, by model and finish reason",
  incremental: true,
});

const agentModelTokens = Metric.counter("agent_model_tokens", {
  description:
    "Tokens the chat agent's model calls used, by model and kind (input, cached_input, output, reasoning)",
  incremental: true,
});

const agentModelResponseSeconds = Metric.histogram(
  "agent_model_response_seconds",
  {
    description: "How long the chat agent's model calls took",
    boundaries: [0.5, 1, 2, 4, 8, 16, 32, 64, 128],
  }
);

const agentToolCalls = Metric.counter("agent_tool_calls", {
  description: "Tool runs of the chat agent, by tool and outcome",
  incremental: true,
});

const agentToolSeconds = Metric.histogram("agent_tool_seconds", {
  description: "How long the chat agent's tool runs took, by tool",
  boundaries: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
});

const agentGenerationErrors = Metric.counter("agent_generation_errors", {
  description: "Chat agent generations that failed",
  incremental: true,
});

const agentAnswerChecks = Metric.counter("agent_answer_checks", {
  description:
    "Answer checks before an answer ended (agent-answer-check.ts), by outcome: passed, held for a correction, or failed (Jev slow or failing)",
  incremental: true,
});

/**
 * Counts one answer check by how it ended.
 *
 * @param outcome - passed, held for correction, or failed to run.
 * @returns The metric update.
 */
export const countAgentAnswerCheck = (outcome: "passed" | "held" | "failed") =>
  Metric.update(Metric.withAttributes(agentAnswerChecks, { outcome }), 1);

const agentTurnGates = Metric.counter("agent_turn_gates", {
  description:
    "Answers a turn gate sent back before they ended (agent-turn-gates.ts), by gate: empty_tool_search, loaded_tool_search or prepared_join",
  incremental: true,
});

/**
 * Counts one answer a turn gate sent back. The stop hooks run outside
 * Effect, so the update is forked on the app runtime.
 *
 * @param gate - The gate that fired.
 */
export const recordAgentTurnGate = (
  gate: "empty_tool_search" | "loaded_tool_search" | "prepared_join"
) => {
  appRuntime.runFork(
    Metric.update(Metric.withAttributes(agentTurnGates, { gate }), 1)
  );
};

// The callbacks run outside Effect, so each one forks its updates on the
// app runtime and returns at once.
const recordAgentTelemetry = (effect: Effect.Effect<unknown>) => {
  appRuntime.runFork(effect);
};

const tokenCount = (value: number | undefined) => value ?? 0;

// The user a tool ran for, from its context.
const decodeAgentToolUser = Schema.decodeUnknownOption(
  Schema.Struct({ userId: Schema.String })
);

export const agentTelemetry: Telemetry = {
  onLanguageModelCallEnd: (event) => {
    const model = { model: event.modelId };
    const { usage } = event;
    recordAgentTelemetry(
      Effect.all(
        [
          Metric.update(
            Metric.withAttributes(agentModelCalls, {
              ...model,
              finish_reason: event.finishReason,
            }),
            1
          ),
          Metric.update(
            Metric.withAttributes(agentModelResponseSeconds, model),
            event.performance.responseTimeMs / 1000
          ),
          Metric.update(
            Metric.withAttributes(agentModelTokens, {
              ...model,
              kind: "input",
            }),
            tokenCount(usage.inputTokenDetails.noCacheTokens)
          ),
          Metric.update(
            Metric.withAttributes(agentModelTokens, {
              ...model,
              kind: "cached_input",
            }),
            tokenCount(usage.inputTokenDetails.cacheReadTokens)
          ),
          Metric.update(
            Metric.withAttributes(agentModelTokens, {
              ...model,
              kind: "output",
            }),
            tokenCount(usage.outputTokenDetails.textTokens)
          ),
          Metric.update(
            Metric.withAttributes(agentModelTokens, {
              ...model,
              kind: "reasoning",
            }),
            tokenCount(usage.outputTokenDetails.reasoningTokens)
          ),
        ],
        { discard: true }
      )
    );
  },
  onToolExecutionEnd: (event) => {
    const tool = event.toolCall.toolName;
    const failed = event.toolOutput.type === "tool-error";
    recordAgentTelemetry(
      Effect.all(
        [
          Metric.update(
            Metric.withAttributes(agentToolCalls, {
              tool,
              outcome: failed ? "error" : "success",
            }),
            1
          ),
          Metric.update(
            Metric.withAttributes(agentToolSeconds, { tool }),
            event.toolExecutionMs / 1000
          ),
          failed
            ? Effect.logWarning("AGENT_TOOL_FAILED").pipe(
                Effect.annotateLogs({ tool })
              )
            : Effect.void,
          // In PostHog per user too: which of the agent's abilities people
          // use (every tool context names its user, agent-tool-context.ts).
          Option.match(decodeAgentToolUser(event.toolContext), {
            onNone: () => Effect.void,
            onSome: ({ userId }) =>
              recordProductEvent(userId, "agent_tool_used", {
                tool,
                outcome: failed ? "error" : "success",
              }),
          }),
        ],
        { discard: true }
      )
    );
  },
  onError: () => {
    recordAgentTelemetry(
      Effect.all(
        [
          Metric.update(agentGenerationErrors, 1),
          Effect.logError("AGENT_GENERATION_FAILED"),
        ],
        { discard: true }
      )
    );
  },
};
