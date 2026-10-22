import { describe, it } from "@effect/vitest";
import { LLMTestCase } from "deepeval/test-case";
import { Effect } from "effect";

import { describeTaskMatches } from "../../../backend/monitor/scoring/task-match-description";
import { OpenAiResponses } from "../../../backend/shared/ai/openai-response";
import { agentAnswerJudge } from "../agent/harness/agent-eval-judge";
import {
  brokerPreferences,
  fittingCommentPost,
  fittingPost,
  renterTask,
} from "./task-post-cases";

// The monitor's LLM descriptions (backend/monitor/scoring/task-match-description.ts):
// for each match Jev scored, the intent says what the person wants, and for
// a match in a comment it describes that comment.
describe("task match descriptions", () => {
  it.live("says what each matching person wants", ({ expect }) =>
    Effect.gen(function* describeMatchingIntents() {
      const descriptions = yield* describeTaskMatches(
        renterTask,
        brokerPreferences,
        [
          { post: fittingPost, commentId: null },
          {
            post: fittingCommentPost,
            commentId: fittingCommentPost.comments[0].id,
          },
        ]
      ).pipe(Effect.provide(OpenAiResponses.layer));

      const intentOf = (postId: string) =>
        descriptions.find((description) => description.postId === postId)
          ?.intent ?? "";

      expect(descriptions).toHaveLength(2);
      yield* Effect.promise(
        async () =>
          await expect(
            new LLMTestCase({
              input: fittingPost.text ?? "",
              actualOutput: intentOf(fittingPost.id),
            })
          ).toPass([
            agentAnswerJudge("Intent says what the person wants", [
              "`test_case.actual_output` is a short Hebrew sentence saying that someone is looking to rent a 3-room apartment in Hadera.",
            ]),
          ])
      );
      yield* Effect.promise(
        async () =>
          await expect(
            new LLMTestCase({
              input: fittingCommentPost.comments[0].text ?? "",
              actualOutput: intentOf(fittingCommentPost.id),
            })
          ).toPass([
            agentAnswerJudge("Intent describes the matching comment", [
              "`test_case.actual_output` is a short Hebrew sentence saying that someone is urgently looking to rent a 3-room apartment in Hadera.",
            ]),
          ])
      );
    })
  );
});
