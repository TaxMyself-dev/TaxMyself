import { Effect, Layer } from "effect";

import { JevRequestError } from "../../../../backend/shared/ai/jev-request-error";
import { JevClient } from "../../../../backend/shared/ai/typesafe-jev-client";

// Jev that never answers in time: every ask fails with a timeout, for the
// tests of what a Jev check does when Jev fails.
export const timedOutJevClient = Layer.succeed(
  JevClient,
  JevClient.of({
    ask: () =>
      Effect.fail(
        new JevRequestError({
          failure: "timeout",
          detail: "no answer in time",
        })
      ),
  })
);
