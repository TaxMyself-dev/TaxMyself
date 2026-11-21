import { describe, it } from "@effect/vitest";
import { Config, Effect } from "effect";
import type { ExpectStatic } from "vitest";

import {
  scoreTaskPosts,
  taskMatchMinScore,
} from "../../../backend/monitor/scoring/task-post-scoring";
import { JevClient } from "../../../backend/shared/ai/typesafe-jev-client";
import { repeatJevEvalRuns } from "../runner/jev-eval-runs";
import {
  brokerPreferences,
  fittingCommentPost,
  haderaRentalsSource,
  herzliyaRentalsSource,
  injectionPost,
  matchingPosts,
  nonMatchingPosts,
  landlordPost,
  otherBrokerPost,
  placelessRenterPost,
  renterTask,
  unrelatedOfferPreferences,
} from "./task-post-cases";

// The monitor's Jev scoring (backend/monitor/scoring/task-post-scoring.ts) decides
// what is a match on its own, so a match it scores low is lost for good:
// every match must reach taskMatchMinScore, and everything else stay below.
const scoreOfPost = (
  scores: readonly { postId: string; score: number }[],
  postId: string
) => scores.find((score) => score.postId === postId)?.score;

// Every renter's post reaches taskMatchMinScore in this run.
const expectMatchesAboveLine = (
  expect: ExpectStatic,
  scores: readonly { postId: string; score: number }[],
  run: number
) => {
  for (const post of matchingPosts) {
    expect(
      scoreOfPost(scores, post.id),
      `run ${run + 1}, post ${post.id}`
    ).toBeGreaterThanOrEqual(taskMatchMinScore);
  }
};

describe("task post scoring", () => {
  it.live(
    "scores the matches above the line and the rest below it",
    ({ expect }) =>
      Effect.gen(function* scoreMatchesAboveLine() {
        yield* Config.Redacted("TYPESAFE_API_KEY");

        const runs = yield* repeatJevEvalRuns(
          scoreTaskPosts(renterTask, brokerPreferences, haderaRentalsSource, [
            ...matchingPosts,
            ...nonMatchingPosts,
          ])
        ).pipe(Effect.provide(JevClient.layer));

        for (const [run, scores] of runs.entries()) {
          const scoreOf = (postId: string) => scoreOfPost(scores, postId);

          expect(scores).toHaveLength(
            matchingPosts.length + nonMatchingPosts.length
          );
          expectMatchesAboveLine(expect, scores, run);

          for (const post of nonMatchingPosts) {
            expect(
              scoreOf(post.id),
              `run ${run + 1}, post ${post.id}`
            ).toBeLessThan(taskMatchMinScore);
          }

          // A post that tries to instruct the scorer scores as what it is.
          expect(scoreOf(injectionPost.id)).toBeLessThan(40);
          // Another broker is on the user's "not relevant" list.
          expect(scoreOf(otherBrokerPost.id)).toBeLessThanOrEqual(50);
          // The match in a comment is attributed to that comment.
          expect(
            scores.find((score) => score.postId === fittingCommentPost.id)
              ?.commentId
          ).toBe(fittingCommentPost.comments[0].id);
        }
      })
  );

  it.live(
    "judges the side by the task, not by a profile offer unrelated to it",
    ({ expect }) =>
      Effect.gen(function* sideByTaskNotProfile() {
        yield* Config.Redacted("TYPESAFE_API_KEY");

        const runs = yield* repeatJevEvalRuns(
          scoreTaskPosts(
            renterTask,
            unrelatedOfferPreferences,
            haderaRentalsSource,
            [...matchingPosts, landlordPost]
          )
        ).pipe(Effect.provide(JevClient.layer));

        for (const [run, scores] of runs.entries()) {
          const scoreOf = (postId: string) => scoreOfPost(scores, postId);
          expectMatchesAboveLine(expect, scores, run);
          expect(
            scoreOf(landlordPost.id),
            `run ${run + 1}, landlord`
          ).toBeLessThan(taskMatchMinScore);
        }
      })
  );

  it.live(
    "judges a post that names no place by its source's place",
    ({ expect }) =>
      Effect.gen(function* placelessPostBySource() {
        yield* Config.Redacted("TYPESAFE_API_KEY");

        const runs = yield* repeatJevEvalRuns(
          Effect.all([
            scoreTaskPosts(renterTask, brokerPreferences, haderaRentalsSource, [
              placelessRenterPost,
            ]),
            scoreTaskPosts(
              renterTask,
              brokerPreferences,
              herzliyaRentalsSource,
              [placelessRenterPost]
            ),
          ])
        ).pipe(Effect.provide(JevClient.layer));

        for (const [run, [[inHadera], [inHerzliya]]] of runs.entries()) {
          expect(
            inHadera?.score,
            `run ${run + 1}, Hadera source`
          ).toBeGreaterThanOrEqual(taskMatchMinScore);
          expect(
            inHerzliya?.score,
            `run ${run + 1}, Herzliya source`
          ).toBeLessThan(taskMatchMinScore);
        }
      })
  );
});
