import type { Effect } from "effect";
import { forEach as effectForEach } from "effect/Effect";

// Jev evals run each case this many times and every run must pass: a
// verdict that flips between runs on the same input is not one the monitor
// can rely on (TypeSafe's judge guidance: run the same cases more than once
// to check that the verdicts stay stable). One after another, so the runs
// do not trip Jev's rate limit.
export const jevEvalRunCount = 3;

/**
 * Runs a Jev eval jevEvalRunCount times, for its variance.
 *
 * @param run - The eval's run.
 * @returns An Effect with each run's result.
 */
export const repeatJevEvalRuns = <A, E, R>(run: Effect.Effect<A, E, R>) =>
  effectForEach(Array.from({ length: jevEvalRunCount }), () => run);
