import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  propagateAttributes,
  setLangfuseTracerProvider,
  startActiveObservation,
} from "@langfuse/tracing";
import type { PropagateAttributesParams } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import {
  NodeTracerProvider,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";
import type { Telemetry } from "ai";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
} from "effect";

// Langfuse tracing of the app's AI calls (cloud.langfuse.com, EU): each agent
// answer as a trace of its model calls and tool runs with their full inputs
// and outputs, grouped by conversation (sessionId) and user (userId); chat
// titles, conversation summaries and the paid ad analyses as their own
// traces. Grafana keeps the counts and timings (agent-telemetry.ts); this is
// where a conversation's content is read when the agent misbehaves.
//
// Config: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL;
// without both keys nothing is traced. LANGFUSE_SAMPLE_RATE (0 to 1, 1 by
// default) keeps that share of traces, whole. LANGFUSE_TRACING_ENVIRONMENT
// overrides the environment label, which is otherwise Vercel's VERCEL_ENV
// (production, preview) or "development"; the evals set "eval".
//
// The AI SDK sends telemetry to the integrations a call names, or to the
// globally registered ones only when it names none; every call passes
// langfuseTelemetryIntegrations itself (as the agent passes agentTelemetry),
// so a dev reload never registers it twice.

// Phone numbers and email addresses in a trace are masked before it leaves
// the server: Israeli numbers (05x mobile, 07x, landlines, +972), alone or
// with dashes or spaces, never digits inside a longer number such as an
// account ID. Adapt the pattern to your users' countries. Names and other personal details stay; Langfuse's EU project
// and its data processing agreement cover them.
const langfusePhonePattern =
  /(?<![\d+])(?:\+?972[- ]?|0)(?:5\d|7\d|[2-489])[- ]?\d{3}[- ]?\d{4}(?!\d)/gu;

// Bounded parts (a local part of at most 64, labels of at most 63) keep the
// search linear.
const langfuseEmailPattern =
  /[\dA-Za-z][\w.+-]{0,63}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/gu;

// A trace value as JSON: what Langfuse hands the mask, parsed.
type LangfuseTraceValue = Schema.Json;

const decodeLangfuseTraceValue = Schema.decodeUnknownOption(Schema.Json);

const maskLangfuseValue = (value: LangfuseTraceValue): LangfuseTraceValue => {
  if (Predicate.isString(value)) {
    return value
      .replaceAll(langfuseEmailPattern, "[email]")
      .replaceAll(langfusePhonePattern, "[phone]");
  }

  if (Array.isArray(value)) {
    return value.map(maskLangfuseValue);
  }

  if (
    value === null ||
    Predicate.isNumber(value) ||
    Predicate.isBoolean(value)
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, maskLangfuseValue(item)])
  );
};

/**
 * Masks emails and phone numbers in data sent to Langfuse: text, and the
 * text inside objects and arrays, since Langfuse hands the mask a JSON
 * attribute already parsed (a tool's input or output); numbers and the rest
 * pass as they are.
 *
 * @param params - data: the trace data.
 * @returns The data, masked.
 */
export const maskLangfuseTraceData = ({ data }: { data: unknown }) =>
  Option.match(decodeLangfuseTraceValue(data), {
    onNone: () => data,
    onSome: maskLangfuseValue,
  });

/**
 * Langfuse tracing of the AI calls: the integrations a call passes, and
 * flushing the buffered spans.
 */
export class LangfuseTracing extends Context.Service<
  LangfuseTracing,
  {
    // The telemetry integrations an AI SDK call passes (telemetry.integrations);
    // empty when Langfuse is not configured.
    readonly integrations: readonly Telemetry[];
    // Sends the spans still buffered: a serverless function freezes once its
    // response ends (flushAppTelemetry).
    readonly flush: Effect.Effect<void>;
  }
>()("app/server/LangfuseTracing") {
  static readonly layer = Layer.effect(
    LangfuseTracing,
    Effect.gen(function* makeLangfuseTracing() {
      const keys = yield* Config.option(
        Config.all({
          publicKey: Config.String("LANGFUSE_PUBLIC_KEY"),
          secretKey: Config.Redacted("LANGFUSE_SECRET_KEY"),
        })
      );

      if (Option.isNone(keys)) {
        return LangfuseTracing.of({ integrations: [], flush: Effect.void });
      }

      const baseUrl = yield* Config.String("LANGFUSE_BASE_URL").pipe(
        Config.withDefault("https://cloud.langfuse.com")
      );

      const sampleRate = yield* Config.Number("LANGFUSE_SAMPLE_RATE").pipe(
        Config.withDefault(1)
      );

      const environment = yield* Config.String(
        "LANGFUSE_TRACING_ENVIRONMENT"
      ).pipe(
        Config.orElse(() => Config.String("VERCEL_ENV")),
        Config.withDefault("development")
      );

      const processor = new LangfuseSpanProcessor({
        publicKey: keys.value.publicKey,
        secretKey: Redacted.value(keys.value.secretKey),
        baseUrl,
        environment,
        mask: maskLangfuseTraceData,
      });

      // Registered as OpenTelemetry's global provider for its context
      // manager, which carries a trace's user and conversation
      // (traceLangfuseAgentAnswer) into the AI calls' spans; the app's own
      // spans go to Grafana through Effect (appObservabilityLive), not
      // through it. The integration below is handed this provider's tracer,
      // so after a dev reload, when the first provider stays global, spans
      // still go through the current one.
      const provider = new NodeTracerProvider({
        sampler: new TraceIdRatioBasedSampler(sampleRate),
        spanProcessors: [processor],
      });

      provider.register();
      // The answers' own observations (traceLangfuseAgentAnswer) use it too.
      setLangfuseTracerProvider(provider);
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          setLangfuseTracerProvider(null);

          await provider.shutdown();
        })
      );

      return LangfuseTracing.of({
        integrations: [
          new LangfuseVercelAiSdkIntegration({
            tracer: provider.getTracer("app-ai"),
          }),
        ],
        flush: Effect.promise(async () => {
          await processor.forceFlush();
        }).pipe(Effect.timeoutOption("5 seconds"), Effect.asVoid),
      });
    }).pipe(Effect.orDie)
  );
}

/**
 * One agent answer as its Langfuse trace: grouped by user and conversation
 * (the attributes are names and ids only, never content), under a root named
 * for the work rather than the model, whose input is the user's message and
 * whose output is the answer, so the trace table reads at a glance. `run`
 * starts the answer and calls `finish` with its text once it ends, which may
 * be after `run` returns (a streamed answer).
 *
 * @param attributes - The user and conversation the trace is grouped by (names
 *   and ids only).
 * @param input - The user's message.
 * @param run - Runs the answer, given finish to call with its text.
 * @returns What run returns.
 */
export const traceLangfuseAgentAnswer = <A>(
  attributes: PropagateAttributesParams,
  input: string,
  run: (finish: (output: string) => void) => A
) =>
  propagateAttributes(attributes, () =>
    startActiveObservation(
      "answer-chat-message",
      (answer) => {
        answer.update({ input });

        return run((output) => {
          answer.update({ output }).end();
        });
      },
      { asType: "agent", endOnExit: false }
    )
  );

// Langfuse's AI SDK integrations when the app runs with LangfuseTracing;
// none where it is not provided, such as unit tests.
export const langfuseIntegrations = Effect.map(
  Effect.serviceOption(LangfuseTracing),
  Option.match({
    onNone: (): Telemetry[] => [],
    onSome: ({ integrations }) => [...integrations],
  })
);

// Sends the Langfuse spans still buffered, when the app traces.
export const flushLangfuseTraces = Effect.flatMap(
  Effect.serviceOption(LangfuseTracing),
  Option.match({
    onNone: () => Effect.void,
    onSome: ({ flush }) => flush,
  })
);

/**
 * The telemetry option an AI SDK call passes: its name and Langfuse's
 * integrations.
 *
 * @param functionId - The call's name in the trace.
 * @returns An Effect with the call's telemetry option.
 */
export const langfuseCallTelemetry = (functionId: string) =>
  Effect.map(langfuseIntegrations, (integrations) => ({
    functionId,
    integrations,
  }));
