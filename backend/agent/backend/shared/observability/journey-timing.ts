import path from "node:path";

import { NodeFileSystem } from "@effect/platform-node";
import {
  Clock,
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
} from "effect";

import { IsoDateTimeString } from "../schema/iso-date-time";
import { isNonEmptyText } from "../text/non-empty-text";

// How long the app's main journeys take, measured where they happen and kept
// as one JSON line each in a local file (JOURNEY_TIMINGS_FILE, by default
// journey-timings.local in the project, which git ignores). The browser's
// journeys reach it through /api/journey-timing; background jobs write
// directly.
// `bun run perf:report` summarizes the file per journey (p50, p75, p95).
//
// - app-load: from navigation start until an app page is interactive.
// - chat-first-reply: from sending a message until the agent's first words
//   or tool appear.
// - chat-server-prep: the server's work before the model starts, with each
//   step's time in details; the rest of chat-first-reply is the model and
//   the network.
// Add a journey per slow path you want to watch (a search, a job).
//
// Details hold counts and phase times only, never post text or names.

export const journeyNames = [
  "app-load",
  "chat-first-reply",
  "chat-server-prep",
  "task-scan",
] as const;

// Strict: decode with { onExcessProperty: "error" } so unknown keys are refused.
export const journeyTimingSchema = Schema.Struct({
  journey: Schema.Literals(journeyNames),
  ms: Schema.Finite.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(3_600_000)
  ),
  details: Schema.optional(
    Schema.Record(
      Schema.String.check(Schema.isMaxLength(40)),
      Schema.Union([Schema.Finite, Schema.String.check(Schema.isMaxLength(80))])
    )
  ),
});

/**
 * How long one journey (a search, a scan) took, and what it involved.
 */
export type JourneyTiming = typeof journeyTimingSchema.Type;

// One JSON line as the file keeps it: the timing and when it was recorded.
const recordedJourneyTimingSchema = Schema.Struct({
  ...journeyTimingSchema.fields,
  at: IsoDateTimeString,
});

type RecordedJourneyTiming = typeof recordedJourneyTimingSchema.Type;

const decodeRecordedJourneyTiming = Schema.decodeUnknownOption(
  Schema.fromJsonString(recordedJourneyTimingSchema),
  { onExcessProperty: "error" }
);

/**
 * The timings file. Under `bun test` (NODE_ENV=test, inherited by the
 * fixtures it spawns) the journeys run on fakes, so they are not recorded
 * unless a test names its own file (JOURNEY_TIMINGS_FILE): `file` is then
 * null, recording does nothing and there is nothing to read.
 */
export class JourneyTimingLog extends Context.Service<
  JourneyTimingLog,
  {
    readonly file: string | null;
    // Appends one line. Measuring never fails the journey it measures: a
    // write that fails is logged, so the Effect cannot fail; journeys that
    // should not wait for the write fork it.
    readonly append: (line: RecordedJourneyTiming) => Effect.Effect<void>;
    // Every well-formed line so far; none when the file does not exist yet.
    readonly readAll: Effect.Effect<Option.Option<RecordedJourneyTiming[]>>;
  }
>()("app/shared/JourneyTimingLog") {
  static readonly layerNoDeps = Layer.effect(
    JourneyTimingLog,
    Effect.gen(function* makeJourneyTimingLog() {
      const fs = yield* FileSystem.FileSystem;

      const configured = yield* Effect.orDie(
        Config.option(Config.String("JOURNEY_TIMINGS_FILE"))
      );

      const nodeEnv = yield* Effect.orDie(
        Config.option(Config.String("NODE_ENV"))
      );

      const file = Option.getOrElse(configured, () =>
        Option.contains(nodeEnv, "test")
          ? null
          : path.resolve(process.cwd(), "journey-timings.local")
      );

      const append = Effect.fn("JourneyTimingLog.append")(function* append(
        line: RecordedJourneyTiming
      ) {
        if (!isNonEmptyText(file)) {
          return;
        }

        yield* fs
          .writeFileString(file, `${JSON.stringify(line)}\n`, { flag: "a" })
          .pipe(
            Effect.matchEffect({
              onFailure: (error) =>
                Effect.logError(
                  "JOURNEY_TIMING_WRITE_FAILED",
                  String(error.cause)
                ),
              onSuccess: Effect.succeed,
            })
          );
      });

      const readAll = Effect.gen(function* readAllJourneyTimings() {
        if (!isNonEmptyText(file)) {
          return Option.none();
        }

        const text = yield* Effect.option(fs.readFileString(file));

        return text.pipe(
          Option.map((content) =>
            content
              .split("\n")
              .flatMap((line) =>
                Option.toArray(decodeRecordedJourneyTiming(line))
              )
          )
        );
      });

      return JourneyTimingLog.of({ file, append, readAll });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(NodeFileSystem.layer)
  );
}

/**
 * Records one timing, stamped with the current time.
 */
export const recordJourneyTiming = Effect.fn("recordJourneyTiming")(
  function* recordJourneyTiming(timing: JourneyTiming) {
    const log = yield* JourneyTimingLog;
    const at = DateTime.formatIso(yield* DateTime.now);
    yield* log.append({ at, ...timing });
  }
);

// Starts a stopwatch on the Effect Clock (a TestClock controls it): the
// Effect it answers reads the milliseconds since, rounded.
export const startJourneyStopwatch = Clock.currentTimeNanos.pipe(
  Effect.map((started) =>
    Clock.currentTimeNanos.pipe(
      Effect.map((now) => Math.round(Number(now - started) / 1_000_000))
    )
  )
);
