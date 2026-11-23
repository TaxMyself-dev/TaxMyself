import { Config, Effect, Redacted, Schedule, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import type { AgentTrace, AgentTraceVerdicts } from "./judge-agent-traces";

// The agent's traces in Langfuse (judge-agent-traces.ts): reading the
// answers to judge, page by page, and writing back each judge's score.

// Langfuse's public API, read with the project's keys.
const langfuseApi = Effect.gen(function* langfuseApi() {
  const publicKey = yield* Config.String("LANGFUSE_PUBLIC_KEY");
  const secretKey = yield* Config.Redacted("LANGFUSE_SECRET_KEY");
  const baseUrl = yield* Config.String("LANGFUSE_BASE_URL");
  const credentials = `${publicKey}:${Redacted.value(secretKey)}`;
  const authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;

  const request = (path: string, init?: RequestInit) =>
    Effect.tryPromise(async () => {
      const headers = new Headers({
        authorization,
        "content-type": "application/json",
      });

      for (const [name, value] of new Headers(init?.headers)) {
        headers.set(name, value);
      }

      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

      if (!response.ok) {
        throw new Error(
          `LANGFUSE_API_FAILED: ${response.status} ${path.split("?")[0]}`
        );
      }

      const body: unknown = await response.json();

      return body;
    }).pipe(
      // Langfuse's API limits reads per minute: a 429 is tried again after
      // 2, 4, 8 then 16 seconds, and then fails.
      Effect.retry({
        schedule: Schedule.exponential("2 seconds"),
        times: 4,
        while: (error) => error.message.includes("LANGFUSE_API_FAILED: 429"),
      })
    );

  return { request };
});

const langfuseObservationsPage = Schema.decodeUnknownSync(
  Schema.Struct({
    data: Schema.Array(
      Schema.Struct({
        traceId: Schema.String,
        type: Schema.String,
        name: Schema.NullOr(Schema.String),
        // A failed tool's span: level ERROR, its error in statusMessage,
        // and no output.
        level: Schema.optional(Schema.NullOr(Schema.String)),
        statusMessage: Schema.optional(Schema.NullOr(Schema.String)),
        input: Schema.optional(Schema.NullOr(Schema.Json)),
        output: Schema.optional(Schema.NullOr(Schema.Json)),
      })
    ),
    meta: Schema.optional(
      Schema.Struct({ cursor: Schema.optional(Schema.NullOr(Schema.String)) })
    ),
  })
);

const langfuseText = (value: Schema.Json | undefined) =>
  Schema.is(Schema.String)(value) ? value : JSON.stringify(value ?? null);

/**
 * The agent's answers in Langfuse since a time, in one environment, up to a
 * limit: each answer's user message, text and tool calls.
 */
export const readAgentTraces = Effect.fn("readAgentTraces")(
  function* readAgentTraces(options: {
    environment: string;
    since: string;
    limit: number;
  }) {
    const { request } = yield* langfuseApi;

    const answers = langfuseObservationsPage(
      yield* request(
        `/api/public/v2/observations?${new URLSearchParams({
          name: "answer-chat-message",
          environment: options.environment,
          fromStartTime: options.since,
          limit: String(options.limit),
          fields: "core,basic,io",
        })}`
      )
    ).data;

    return yield* effectForEach(
      answers,
      (answer) =>
        Effect.map(
          request(
            `/api/public/v2/observations?${new URLSearchParams({
              traceId: answer.traceId,
              type: "TOOL",
              limit: "100",
              fields: "core,basic,io",
            })}`
          ),
          (page): AgentTrace => ({
            traceId: answer.traceId,
            userMessage: langfuseText(answer.input),
            answer: langfuseText(answer.output),
            // Langfuse lists the newest first; the answer's order is oldest
            // first.
            tools: langfuseObservationsPage(page)
              .data.toReversed()
              .map((tool) => ({
                name: tool.name ?? "",
                input: langfuseText(tool.input),
                failed: tool.level === "ERROR",
                output:
                  tool.level === "ERROR"
                    ? (tool.statusMessage ?? "")
                    : langfuseText(tool.output),
              })),
          })
        ),
      { concurrency: 4 }
    );
  }
);

/**
 * Writes each judge's verdict on a trace back to Langfuse as a score.
 */
export const writeAgentTraceScores = Effect.fn("writeAgentTraceScores")(
  function* writeAgentTraceScores(
    traceId: string,
    environment: string,
    verdicts: AgentTraceVerdicts
  ) {
    const { request } = yield* langfuseApi;

    for (const [name, verdict] of Object.entries(verdicts)) {
      yield* request("/api/public/scores", {
        method: "POST",
        body: JSON.stringify({
          traceId,
          environment,
          name: `agent-judge-${name}`,
          value: verdict.flagged ? 1 : 0,
          dataType: "BOOLEAN",
          comment: verdict.reason,
        }),
      });
    }
  }
);
