import { assert, effect as test } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

import { scoreTaskPosts } from "../../../../backend/monitor/scoring/task-post-scoring";
import { JevClient } from "../../../../backend/shared/ai/typesafe-jev-client";
import { withFakeFetch } from "../../shared/fixtures/fake-fetch-layer";
import {
  fakeJev,
  haifaRentalsSource,
  jevAnswering,
  jevPostStates,
  jevRequests,
  post,
  preferences,
  runOnTestClock,
  task,
} from "./task-post-scoring-fixture";

const haifaApartmentPost = "Looking for an apartment in Haifa";
const apartmentWanted = "Looking for an apartment";

// How Jev's answers become the monitor's scores: the fit level as a 0-100
// score, the side, place and "not relevant" answers capping it below a
// match, and the reply Jev picks. Jev itself is stood in by a fake answering per
// item text.

test("the fit level becomes a 0-100 score, and a not-relevant item is capped at 50", () =>
  Effect.gen(function* fitLevelBecomes0() {
    const jev = fakeJev({
      "Looking for an apartment in Haifa": { fit: 4, excluded: 0.02 },
      "Selling a sofa": { fit: 0, excluded: 0.01 },
      "Letting agent looking for a partner in Haifa": {
        fit: 3.6,
        excluded: 0.93,
      },
    });

    const scores = yield* scoreTaskPosts(
      task,
      preferences,
      haifaRentalsSource,
      [
        post("11", haifaApartmentPost),
        post("12", "Selling a sofa"),
        post("13", "Letting agent looking for a partner in Haifa"),
      ]
    ).pipe(Effect.provide(jev));

    assert.deepStrictEqual(
      scores.map(({ postId, score }) => ({ postId, score })),
      [
        { postId: "11", score: 100 },
        { postId: "12", score: 0 },
        { postId: "13", score: 50 },
      ]
    );
  }));

test("the wrong side or another place caps even a clear request below a match", () =>
  Effect.gen(function* wrongSideAnotherPlace() {
    const jev = fakeJev({
      "Renting out my apartment in Haifa": { fit: 3.2, side: 0.15 },
      "Looking for an apartment in Tel Aviv": { fit: 3.6, place: 0.05 },
    });

    const scores = yield* scoreTaskPosts(task, null, haifaRentalsSource, [
      post("71", "Renting out my apartment in Haifa"),
      post("72", "Looking for an apartment in Tel Aviv"),
    ]).pipe(Effect.provide(jev));

    assert.deepStrictEqual(
      scores.map(({ score }) => score),
      [50, 50]
    );
  }));

test("Jev's pick of a comment is kept only when it is one of the item's replies", () =>
  Effect.gen(function* jevSPickComment() {
    const jev = fakeJev({
      "What do rents cost in Haifa?": { fit: 3.5, source: "c-1" },
      "Apartments in Haifa?": { fit: 3.5, source: "c-not-here" },
    });

    const scores = yield* scoreTaskPosts(task, null, haifaRentalsSource, [
      post("21", "What do rents cost in Haifa?", ["c-1"]),
      post("22", "Apartments in Haifa?", ["c-2"]),
    ]).pipe(Effect.provide(jev));

    assert.deepStrictEqual(
      scores.map(({ postId, commentId }) => ({ postId, commentId })),
      [
        { postId: "21", commentId: "c-1" },
        { postId: "22", commentId: null },
      ]
    );
  }));

test("questions are asked only when they apply: no replies, no source; no list, no exclusion", () =>
  Effect.gen(function* questionsAskedOnlyWhen() {
    const jev = fakeJev({ "Looking for an apartment": { fit: 2 } });
    yield* scoreTaskPosts(task, null, haifaRentalsSource, [
      post("31", apartmentWanted),
    ]).pipe(Effect.provide(jev));
    assert.deepStrictEqual(jevRequests, [
      { questions: ["fit", "side", "place"] },
    ]);
  }));

test("Jev gets each item's and reply's age worked out in code, not a timestamp", () =>
  Effect.gen(function* jevGetsAgeFromCode() {
    yield* TestClock.setTime(Date.parse("2026-10-10T12:00:00.000Z"));
    const jev = fakeJev({ "Looking for an apartment in Haifa": { fit: 3 } });
    const dated = post("91", haifaApartmentPost, ["c-9"]);
    yield* scoreTaskPosts(task, null, haifaRentalsSource, [
      {
        ...dated,
        createdAt: "2026-10-10T09:00:00.000Z",
        comments: dated.comments.map((comment) => ({
          ...comment,
          createdAt: "2026-10-01T12:00:00.000Z",
        })),
      },
    ]).pipe(Effect.provide(jev));
    assert.deepStrictEqual(jevPostStates, [
      {
        age: "posted 3 hours ago",
        text: haifaApartmentPost,
        attachments: [],
        comments: [
          {
            id: "c-9",
            age: "posted 9 days ago",
            text: "Looking for an apartment in Haifa",
          },
        ],
      },
    ]);
  }));

test("Jev's raw answers and their confidence are kept with the score", () =>
  Effect.gen(function* rawAnswersKept() {
    const jev = jevAnswering(
      async () =>
        await Promise.resolve(
          Response.json({
            answers: {
              fit: { type: "score", score: 3, confidence: 0.42 },
              side: { type: "noul", noul: 0.8 },
              place: { type: "noul", noul: 0.9 },
            },
          })
        )
    );

    const [score] = yield* scoreTaskPosts(task, null, haifaRentalsSource, [
      post("92", apartmentWanted),
    ]).pipe(Effect.provide(jev));

    assert.deepStrictEqual(score?.jevAnswers, {
      fit: { score: 3, confidence: 0.42 },
      side: { noul: 0.8 },
      place: { noul: 0.9 },
    });
  }));

// Jev picking the item's first reply, whose writer answers commentSide;
// the item's own writer is on the wrong side.
const scoreCommentMatch = (commentSide: number) =>
  scoreTaskPosts(task, null, haifaRentalsSource, [
    post("93", "What do rents cost in Haifa?", ["c-1"]),
  ]).pipe(
    Effect.provide(
      jevAnswering(
        async () =>
          await Promise.resolve(
            Response.json({
              answers: {
                fit: { score: 4 },
                side: { noul: 0.1 },
                place: { noul: 0.9 },
                source: { choice: "c-1" },
                commentSide0: { noul: commentSide },
              },
            })
          )
      )
    )
  );

test("a reply match is gated by its own writer's side, not the item writer's", () =>
  Effect.gen(function* commentWriterSideGates() {
    const [renterComment] = yield* scoreCommentMatch(0.9);
    const [landlordComment] = yield* scoreCommentMatch(0.2);
    assert.deepStrictEqual(
      [renterComment?.score, landlordComment?.score],
      [100, 50]
    );
    assert.deepStrictEqual(renterComment?.jevAnswers.commentSide, {
      noul: 0.9,
    });
  }));

test("a failed Jev request fails the scan, so the next scan retries the items", () =>
  Effect.gen(function* failedJevRequestFails() {
    const jev = fakeJev({ "Looking for an apartment": "fail" });
    assert.match(
      (yield* Effect.flip(
        scoreTaskPosts(task, null, haifaRentalsSource, [
          post("41", apartmentWanted),
        ]).pipe(Effect.provide(jev))
      )).message,
      /scoring/u
    );
  }));

test("a busy answer is retried with backoff; one still busy after three retries fails the scan", () =>
  Effect.gen(function* busyAnswerRetriedOnce() {
    let calls = 0;

    const busyOnce = jevAnswering(async () => {
      calls += 1;

      return await Promise.resolve(
        calls === 1
          ? new Response("busy", { status: 529 })
          : Response.json({
              answers: {
                fit: { score: 4 },
                side: { noul: 0.9 },
                place: { noul: 0.9 },
              },
            })
      );
    });

    const [score] = yield* runOnTestClock(
      scoreTaskPosts(task, null, haifaRentalsSource, [
        post("81", apartmentWanted),
      ]).pipe(Effect.provide(busyOnce))
    );

    assert.strictEqual(calls, 2);
    assert.strictEqual(score?.score, 100);

    calls = 0;

    const alwaysBusy = jevAnswering(async () => {
      calls += 1;

      return await Promise.resolve(new Response("busy", { status: 529 }));
    });

    const failure = yield* Effect.flip(
      runOnTestClock(
        scoreTaskPosts(task, null, haifaRentalsSource, [
          post("82", apartmentWanted),
        ]).pipe(Effect.provide(alwaysBusy))
      )
    );

    assert.match(failure.message, /scoring/u);
    assert.strictEqual(calls, 4);
  }));

test("an answer outside the five levels fails the scan instead of scoring wrong", () =>
  Effect.gen(function* answerOutsideFiveLevels() {
    const jev = fakeJev({ "Looking for an apartment": { fit: 7 } });
    assert.match(
      (yield* Effect.flip(
        scoreTaskPosts(task, null, haifaRentalsSource, [
          post("51", apartmentWanted),
        ]).pipe(Effect.provide(jev))
      )).message,
      /scoring/u
    );
  }));

test("a missing TypeSafe key is named in the task's scan error", () =>
  Effect.gen(function* missingTypesafeKeyReported() {
    const jevWithoutKey = withFakeFetch(
      JevClient.layer,
      () => {
        throw new Error("no request expected");
      },
      {}
    );

    assert.match(
      (yield* Effect.flip(
        scoreTaskPosts(task, null, haifaRentalsSource, [
          post("61", apartmentWanted),
        ]).pipe(Effect.provide(jevWithoutKey))
      )).message,
      /TYPESAFE_API_KEY/u
    );
  }));
