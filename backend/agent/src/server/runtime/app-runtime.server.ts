import { Effect, Layer, ManagedRuntime, Predicate } from "effect";
import { OtlpExporter } from "effect/observability";

import { AgentLanguageModel } from "@/agent/core/model/agent-model";
import {
  flushLangfuseTraces,
  LangfuseTracing,
} from "@/server/integrations/langfuse-tracing.server";
import {
  flushProductEvents,
  PostHogProductEvents,
} from "@/server/integrations/posthog-product-events.server";
import { currentAgentRequestUser } from "@/server/runtime/agent-request-context";
import { AgentRequestIdentity } from "@/server/runtime/agent-request-identity";
import { recordAppResponse } from "@/server/runtime/app-request-metrics";
import { SupabaseRequestClient } from "@/server/runtime/supabase-client";

import { JevClient } from "../../../backend/shared/ai/typesafe-jev-client";
import { AgentMysqlDatabase } from "../../../backend/shared/mysql/mysql-agent-database";
import { appObservabilityLive } from "../../../backend/shared/observability/app-observability";
import { JourneyTimingLog } from "../../../backend/shared/observability/journey-timing";
import { SupabaseServiceDatabase } from "../../../backend/shared/supabase/supabase-service-database";

// The agent server's long-lived services, built once on first use and shared
// by every request; add your ports' real implementations here. Services
// share one FetchHttpClient through the memo map. Logging and telemetry
// follow appObservabilityLive. The template served requests from Nitro; in
// KeepInTax the Nest backend's agent module hands each request to
// handleAgentHttpRequest (src/server/agent-http.server.ts), which runs it
// here.
const AppLive = Layer.mergeAll(
  appObservabilityLive("app"),
  AgentMysqlDatabase.layer,
  SupabaseServiceDatabase.layer,
  JevClient.layer,
  JourneyTimingLog.layer,
  AgentLanguageModel.layer,
  LangfuseTracing.layer,
  PostHogProductEvents.layer
);

/**
 * The services the app's server runtime provides.
 */
export type AppServices = Layer.Success<typeof AppLive>;

// Server-only: never import it outside a request handler or a *.server.ts
// module.
export const appRuntime = ManagedRuntime.make(AppLive, {
  memoMap: Layer.makeMemoMapUnsafe(),
});

/**
 * Disposes the runtime: its layers' finalizers run, among them the OTLP
 * exporter's flush of buffered logs and traces (appObservabilityLive), the
 * Langfuse spans and the database pool. The Nest agent module calls it when
 * the backend shuts down.
 *
 * @returns A promise that settles once every finalizer ran.
 */
export const disposeAppRuntime = async () => {
  await appRuntime.dispose();
};

// Sends the traces, logs and metrics the exporters still hold
// (appObservabilityLive's Flusher), the Langfuse spans (LangfuseTracing) and
// the PostHog product events (PostHogProductEvents), each bounded so a slow
// collector cannot hold a request open. The app flushes after each response
// (handleAgentHttpRequest) and after each streamed agent answer
// (agent-chat-answer-run.server.ts), whose telemetry outlives its response.
export const flushAppTelemetry = Effect.all(
  [
    OtlpExporter.Flusher.use((flusher) => flusher.flush).pipe(
      Effect.timeoutOption("5 seconds"),
      Effect.asVoid
    ),
    flushLangfuseTraces,
    flushProductEvents,
  ],
  { concurrency: "unbounded", discard: true }
);

// A request that a serverless host lets keep working after its response.
const canKeepAppRequestAlive = (
  request: Request
): request is Request & { waitUntil: (work: Promise<unknown>) => void } =>
  Predicate.hasProperty(request, "waitUntil") &&
  Predicate.isFunction(request.waitUntil);

/**
 * Keeps the function running after its response until `work` settles: on a
 * serverless host the platform's waitUntil is on the request; in the Nest
 * backend (a long-lived Node process), the dev server and the evals there
 * is none and the work just runs.
 *
 * @param request - The incoming request.
 * @param work - The work to wait for.
 */
export const keepAppRequestAlive = (
  request: Request,
  work: Promise<unknown>
) => {
  if (canKeepAppRequestAlive(request)) {
    request.waitUntil(work);
  }
};

/**
 * Records one response's metrics, then flushes what the request recorded,
 * without holding the response (the template's Nitro response hook).
 *
 * @param request - The request.
 * @param response - Its response.
 * @param seconds - How long it took to start the response.
 */
export const recordAppRequestEnd = (
  request: Request,
  response: Response,
  seconds: number
) => {
  keepAppRequestAlive(
    request,
    appRuntime.runPromise(
      recordAppResponse(request, response, seconds).pipe(
        Effect.andThen(flushAppTelemetry)
      )
    )
  );
};

/**
 * Runs one request's program at an edge (a server function's handler, an API
 * route): the app's services from appRuntime, the verified user of the
 * request being served (AgentRequestIdentity, from the request's context,
 * agent-request-context.ts) and their client (SupabaseRequestClient). The
 * signal, when given, interrupts the program.
 *
 * @param program - The request's program.
 * @param options - Run options, such as an abort signal.
 * @returns A promise of the program's result.
 */
export const runAppRequest = async <A, E>(
  program: Effect.Effect<
    A,
    E,
    AppServices | SupabaseRequestClient | AgentRequestIdentity
  >,
  options?: Effect.RunOptions
) =>
  await appRuntime.runPromise(
    program.pipe(
      Effect.provide(SupabaseRequestClient.layer),
      Effect.provideService(AgentRequestIdentity, currentAgentRequestUser())
    ),
    options
  );
