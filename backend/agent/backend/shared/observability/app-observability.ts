import { Config, Effect, Layer, Logger, Option, References } from "effect";
import { FetchHttpClient } from "effect/http";
import { Otlp, OtlpExporter, OtlpSerialization } from "effect/observability";

// How the app server (appRuntime) and the browser worker log: one JSON line
// per entry in production (NODE_ENV=production), Effect's readable console
// format otherwise, from LOG_LEVEL up (Trace, Debug, Info, Warn, Error,
// Fatal; Info by default).
const appConsoleLoggingLive = Layer.unwrap(
  Effect.gen(function* readAppLoggingConfig() {
    const environment = yield* Config.String("NODE_ENV").pipe(
      Config.withDefault("development")
    );

    const minimumLevel = yield* Config.LogLevel("LOG_LEVEL").pipe(
      Config.withDefault("Info")
    );

    return Layer.mergeAll(
      Logger.layer([
        environment === "production"
          ? Logger.consoleJson
          : Logger.consolePretty(),
      ]),
      Layer.succeed(References.MinimumLogLevel, minimumLevel)
    );
  }).pipe(Effect.orDie)
);

// Exports the spans (every Effect.fn), logs and metrics over OTLP/HTTP from
// the standard OpenTelemetry variables (Otlp.layerFromConfig):
// OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS (Grafana Cloud's
// "Authorization=Basic%20<base64 instance:token>"), OTEL_RESOURCE_ATTRIBUTES,
// and OTEL_TRACES_EXPORTER / OTEL_LOGS_EXPORTER / OTEL_METRICS_EXPORTER set
// to otlp. Unlike the OpenTelemetry SDK, Effect exports a signal only when
// its *_EXPORTER says otlp, so without them nothing leaves the process;
// OTEL_SDK_DISABLED=true turns all of it off. A local collector listens on
// 4318 by default, which the browser worker already uses: give it another
// port. The console logs stay.
//
// On Vercel the environment label is Vercel's own VERCEL_ENV (production or
// preview), which overrides OTEL_RESOURCE_ATTRIBUTES, so one set of
// variables serves both without previews counting as production.
//
// The layer also provides the exporters' Flusher (OtlpExporter.layerFlusher,
// shared by the three signals): a serverless function freezes once its
// response ends, so the app flushes after each response
// (flushAppTelemetry, app-runtime.server.ts) instead of waiting for the
// export interval.
const appTelemetryLive = (serviceName: string) =>
  Layer.unwrap(
    Effect.gen(function* readAppTelemetryEnvironment() {
      const vercelEnvironment = yield* Config.option(
        Config.String("VERCEL_ENV")
      );

      return Otlp.layerFromConfig({
        resource: {
          serviceName,
          attributes: Option.match(vercelEnvironment, {
            onNone: () => ({}),
            onSome: (environment) => ({
              "deployment.environment.name": environment,
            }),
          }),
        },
        loggerMergeWithExisting: true,
      });
    }).pipe(Effect.orDie)
  ).pipe(
    Layer.provideMerge(OtlpExporter.layerFlusher),
    Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer])
  );

/**
 * Logging, and telemetry export when configured, for one service
 * ("app" or "app-worker").
 *
 * @param serviceName - The service's name in the telemetry.
 * @returns The layer that logs, and exports telemetry when configured.
 */
export const appObservabilityLive = (serviceName: string) =>
  appTelemetryLive(serviceName).pipe(Layer.provideMerge(appConsoleLoggingLive));
