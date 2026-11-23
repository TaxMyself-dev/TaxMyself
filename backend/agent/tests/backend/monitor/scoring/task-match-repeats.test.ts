import { assert, effect as test } from "@effect/vitest";
import { Effect, Schema } from "effect";
import type { Layer } from "effect";

import { dropRepeatedTaskMatches } from "../../../../backend/monitor/scoring/task-match-repeats";
import type { TaskScoredPost } from "../../../../backend/monitor/scoring/task-scored-post";
import { JevClient } from "../../../../backend/shared/ai/typesafe-jev-client";
import { withFakeFetch } from "../../shared/fixtures/fake-fetch-layer";
import { fakeFetchBodyText } from "../../shared/fixtures/fake-fetch-request";

// Jev's request, as far as this fake reads it.
const decodeRepeatRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      state: Schema.Struct({ later: Schema.Struct({ text: Schema.String }) }),
    })
  )
);

// Which matches are repeats of a request the task already has: the same
// author with the same text (code), or in other words (Jev, stood in by a
// fake that answers per text pair).

const post = (id: string, authorId: string, text: string): TaskScoredPost => ({
  id,
  text,
  createdAt: null,
  authorId,
  attachments: [],
  comments: [],
});

const match = (source: string, item: TaskScoredPost) => ({
  post: item,
  source,
  commentId: null,
});

// Jev's answers by the later text; counts the questions asked.
let jevQuestions = 0;

const fakeJev = (
  repeatByLaterText: Record<string, number | "fail">
): Layer.Layer<JevClient> => {
  jevQuestions = 0;

  return withFakeFetch(
    JevClient.layer,
    async (_url, options) => {
      jevQuestions += 1;
      const { state } = decodeRepeatRequest(fakeFetchBodyText(options?.body));
      const answer = repeatByLaterText[state.later.text];

      return await Promise.resolve(
        answer === undefined || answer === "fail"
          ? new Response("rejected", { status: 400 })
          : Response.json({ answers: { repeat: { noul: answer } } })
      );
    },
    { TYPESAFE_API_KEY: "test-key" }
  );
};

const earlier = [
  {
    source: "web",
    itemId: "100",
    authorId: "7",
    text: "Looking for a 3-room apartment in Haifa, up to $1,500",
  },
];

test("the same person's same text in another source is a repeat, decided without Jev", () =>
  Effect.gen(function* samePersonSameText() {
    const jev = fakeJev({});

    const result = yield* dropRepeatedTaskMatches(
      [
        match(
          "forum",
          post(
            "200",
            "7",
            "Looking for a 3-room apartment, in Haifa up to $1,500!"
          )
        ),
      ],
      earlier
    ).pipe(Effect.provide(jev));

    assert.deepStrictEqual(result, { kept: [], repeats: 1 });
    assert.strictEqual(jevQuestions, 0);
  }));

test("another person's request is new, with no question to Jev", () =>
  Effect.gen(function* anotherPersonsRequest() {
    const jev = fakeJev({});

    const result = yield* dropRepeatedTaskMatches(
      [
        match(
          "forum",
          post(
            "201",
            "8",
            "Looking for a 3-room apartment in Haifa, up to $1,500"
          )
        ),
      ],
      earlier
    ).pipe(Effect.provide(jev));

    assert.strictEqual(result.kept.length, 1);
    assert.strictEqual(jevQuestions, 0);
  }));

test("the same person in other words is a repeat when Jev says so, and new when it does not", () =>
  Effect.gen(function* samePersonOtherWords() {
    const reworded =
      "A couple with a baby needs 3 rooms to rent in Haifa, budget 1.5k";

    const storage = "Also looking for a storage unit to rent nearby";
    const jev = fakeJev({ [reworded]: 0.93, [storage]: 0.08 });

    const result = yield* dropRepeatedTaskMatches(
      [
        match("classifieds", post("202", "7", reworded)),
        match("classifieds", post("203", "7", storage)),
      ],
      earlier
    ).pipe(Effect.provide(jev));

    assert.deepStrictEqual(
      result.kept.map((item) => item.post.id),
      ["203"]
    );
    assert.strictEqual(result.repeats, 1);
  }));

test("a request posted twice in one scan is kept once", () =>
  Effect.gen(function* requestPostedTwiceOneScan() {
    const jev = fakeJev({});

    const result = yield* dropRepeatedTaskMatches(
      [
        match("web", post("204", "9", "Buying an apartment in Haifa")),
        match("forum", post("205", "9", "Buying an apartment in Haifa")),
      ],
      []
    ).pipe(Effect.provide(jev));

    assert.deepStrictEqual(
      result.kept.map((item) => item.post.id),
      ["204"]
    );
  }));

test("when Jev cannot answer, the match is kept rather than lost", () =>
  Effect.gen(function* whenJevCannotAnswer() {
    const other = "A completely different text by the same person";
    const jev = fakeJev({ [other]: "fail" });

    const result = yield* dropRepeatedTaskMatches(
      [match("forum", post("206", "7", other))],
      earlier
    ).pipe(Effect.provide(jev));

    assert.strictEqual(result.kept.length, 1);
    assert.strictEqual(result.repeats, 0);
  }));
