import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  bestEffortTelemetry,
  observeBackgroundWork,
} from "../../../../src/server/runtime/app-telemetry-errors";

describe("optional telemetry failures", () => {
  it.effect(
    "contains a refused connection and still runs the next exporter",
    () =>
      Effect.gen(function* containsNetworkFailure() {
        const sent: string[] = [];
        yield* Effect.all([
          bestEffortTelemetry(
            "test-network",
            Effect.promise(async () => {
              await Promise.resolve();
              throw new AggregateError(
                [new Error("ECONNREFUSED")],
                "collector unavailable"
              );
            })
          ),
          bestEffortTelemetry(
            "test-healthy",
            Effect.sync(() => {
              sent.push("healthy");
            })
          ),
        ]);
        assert.deepStrictEqual(sent, ["healthy"]);
      })
  );

  it.effect("contains a defect in an optional exporter", () =>
    Effect.gen(function* containsExporterDefect() {
      const result = yield* bestEffortTelemetry(
        "test-defect",
        Effect.die(new Error("exporter failed"))
      );

      assert.isUndefined(result);
    })
  );

  it("observes a background rejection even when reporting also throws", async () => {
    let reported = false;
    await observeBackgroundWork(Promise.reject(new Error("background")), () => {
      reported = true;
      throw new Error("logger");
    });
    assert.isTrue(reported);
  });

  it("passes the original background failure to its reporter", async () => {
    const original = new Error("save failed");
    const seen: unknown[] = [];
    await observeBackgroundWork(Promise.reject(original), (error) => {
      seen.push(error);
    });
    assert.deepStrictEqual(seen, [original]);
  });
});
