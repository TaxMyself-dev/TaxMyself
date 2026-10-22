import { Effect, Fiber, Predicate, Schema } from "effect";
import { TestClock } from "effect/testing";

import type {
  MonitorUserPreferences,
  MonitoredTask,
} from "../../../../backend/monitor/scan/task-monitor-records";
import type { TaskScoredPost } from "../../../../backend/monitor/scoring/task-scored-post";
import { JevClient } from "../../../../backend/shared/ai/typesafe-jev-client";
import { withFakeFetch } from "../../shared/fixtures/fake-fetch-layer";
import { fakeFetchBodyText } from "../../shared/fixtures/fake-fetch-request";

// Jev's request, as far as this fake reads it.
const decodeScoringRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      questions: Schema.Record(Schema.String, Schema.Unknown),
      state: Schema.Struct({
        post: Schema.Record(Schema.String, Schema.Json),
      }),
    })
  )
);

// A letting agent's task, its items and a fake Jev answering per item text,
// for the monitor's scoring tests (task-post-scoring.test.ts).

export const task: MonitoredTask = {
  run_id: "00000000-0000-4000-8000-000000000003",
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  sentence: "Renters looking for apartments in Haifa",
  details: "",
  location: "Haifa",
  budget: "",
  sources: [],
  alerts: true,
  last_scanned_at: null,
};

export const preferences: MonitorUserPreferences = {
  seeking: "renters",
  not_relevant: "other letting agents",
  offer: "letting apartments",
  areas: "Haifa",
  languages: ["en"],
  app_locale: "en",
};

export const haifaRentalsSource = { name: "web: apartments for rent in Haifa" };

/**
 * An item for the scoring tests, its replies looking for an apartment in
 * Haifa.
 *
 * @param id - The item's id.
 * @param text - Its text.
 * @param commentIds - Its replies' ids.
 * @returns The item as scoring reads it.
 */
export const post = (
  id: string,
  text: string,
  commentIds: string[] = []
): TaskScoredPost => ({
  id,
  text,
  createdAt: null,
  authorId: `author-${id}`,
  attachments: [],
  comments: commentIds.map((commentId) => ({
    id: commentId,
    text: "Looking for an apartment in Haifa",
    createdAt: null,
    authorId: `author-${commentId}`,
  })),
});

interface FakeJevAnswers {
  fit: number;
  side?: number;
  place?: number;
  excluded?: number;
  source?: string;
}

export const jevRequests: { questions: string[] }[] = [];
export const jevPostStates: unknown[] = [];

/**
 * Jev answering with a fake fetch, with TYPESAFE_API_KEY set.
 *
 * @param fakeFetch - The fetch Jev's requests go to.
 * @returns The Jev client's layer.
 */
export const jevAnswering = (fakeFetch: typeof globalThis.fetch) =>
  withFakeFetch(JevClient.layer, fakeFetch, { TYPESAFE_API_KEY: "test-key" });

/**
 * Answers each item by its text; records which questions each request asked.
 *
 * @param answers - Each item's answers by its text, or fail to fail its
 *   request.
 * @returns The Jev client's layer.
 */
export const fakeJev = (answers: Record<string, FakeJevAnswers | "fail">) => {
  jevRequests.length = 0;
  jevPostStates.length = 0;

  return jevAnswering(async (_url, options) => {
    const request = decodeScoringRequest(fakeFetchBodyText(options?.body));
    jevRequests.push({ questions: Object.keys(request.questions) });
    jevPostStates.push(request.state.post);
    const { text } = request.state.post;
    const answer = Predicate.isString(text) ? answers[text] : undefined;

    if (answer === undefined || answer === "fail") {
      return await Promise.resolve(
        new Response("unavailable", { status: 503 })
      );
    }

    return await Promise.resolve(
      Response.json({
        answers: {
          fit: { score: answer.fit },
          side: { noul: answer.side ?? 0.9 },
          place: { noul: answer.place ?? 0.9 },
          // Each reply's writer answers as the item's does.
          ...Object.fromEntries(
            Object.keys(request.questions)
              .filter((key) => key.startsWith("commentSide"))
              .map((key) => [key, { noul: answer.side ?? 0.9 }])
          ),
          ...(answer.excluded !== undefined && {
            excluded: { noul: answer.excluded },
          }),
          ...(answer.source !== undefined && {
            source: { choice: answer.source },
          }),
        },
      })
    );
  });
};

/**
 * Runs the effect while moving it.effect's TestClock a second at a time
 * until it ends, so the retry's one-second wait passes at once.
 *
 * @param effect - The effect to run.
 * @returns An effect with its result.
 */
export const runOnTestClock = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* runUntilDone() {
    const fiber = yield* Effect.forkChild(effect);

    while (fiber.pollUnsafe() === undefined) {
      yield* TestClock.adjust("1 second");
      yield* TestClock.withLive(Effect.sleep("1 millis"));
    }

    return yield* Fiber.join(fiber);
  });
