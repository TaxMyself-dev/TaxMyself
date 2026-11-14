import { Effect } from "effect";

// Optional exporters must not fail a chat, shutdown, or one another. Warn at
// most once a minute per exporter, without printing credentials or payloads.
const nextWarning = new Map<string, number>();

/**
 * Contains optional exporter failures with rate-limited warnings.
 * @param source - The fixed exporter label, without secrets.
 * @param work - The bounded export operation.
 * @returns A successful effect, including after export failure.
 */
export const bestEffortTelemetry = <A, E, R>(
  source: string,
  work: Effect.Effect<A, E, R>
): Effect.Effect<void, never, R> =>
  work.pipe(
    Effect.asVoid,
    Effect.catchCause(() =>
      Effect.sync(() => {
        const now = Date.now();

        if (now < (nextWarning.get(source) ?? 0)) {
          return;
        }

        nextWarning.set(source, now + 60_000);

        try {
          console.warn(
            "AGENT_TELEMETRY_EXPORT_FAILED",
            source,
            "optional exporter unavailable; the app continues"
          );
        } catch {
          /* best effort */
        }
      })
    )
  );

// Attach the rejection handler immediately, including on hosts with waitUntil.
// A failure of the error reporter itself must not leak another rejection.
/**
 * Observes detached work immediately, including when error reporting fails.
 * @param work - The background operation already started.
 * @param report - The application's error reporter.
 * @returns A settled promise that never propagates the background failure.
 */
export const observeBackgroundWork = async (
  work: Promise<unknown>,
  report: (error: Error) => void
): Promise<void> => {
  try {
    await work;
  } catch (error) {
    try {
      report(
        error instanceof Error
          ? error
          : new Error("Background work rejected with a non-Error value")
      );
    } catch {
      /* best effort */
    }
  }
};
