import { assert, effect as test } from "@effect/vitest";
import { Effect, Schema } from "effect";

import type { MonitoredTask } from "../../../../backend/monitor/scan/task-monitor-records";
import { describeTaskMatches } from "../../../../backend/monitor/scoring/task-match-description";
import type { TaskScoredPost } from "../../../../backend/monitor/scoring/task-scored-post";
import { OpenAiResponses } from "../../../../backend/shared/ai/openai-response";
import { withFakeFetch } from "../../shared/fixtures/fake-fetch-layer";
import { fakeFetchBodyText } from "../../shared/fixtures/fake-fetch-request";

// The LLM writes the intent and reason of each match Jev scored; it no
// longer scores. OpenAI is stood in by a fake answer.

const task: MonitoredTask = {
  run_id: "00000000-0000-4000-8000-000000000003",
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  sentence: "A 4-room apartment in Haifa",
  details: "",
  location: "Haifa",
  budget: "up to $2,000",
  sources: [],
  alerts: true,
  last_scanned_at: null,
};

// An item the scoring matched, as the description reads it.
const scoredItemFixture = (id: string): TaskScoredPost => ({
  id,
  text: "Looking for a 4-room apartment in Haifa, up to $2,000",
  createdAt: "2026-10-01T09:00:00.000Z",
  authorId: `author-${id}`,
  attachments: [],
  comments: [],
});

interface FakeDescription {
  postId: string;
  intent: string;
  reason: string;
}

const answerWith = (descriptions: FakeDescription[]) =>
  withFakeFetch(
    OpenAiResponses.layer,
    async () =>
      await Promise.resolve(
        Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify({ descriptions }) },
              ],
            },
          ],
        })
      ),
    { OPENAI_API_KEY: "test-key" }
  );

test("each match keeps one description; unknown items are dropped", () =>
  Effect.gen(function* eachMatchKeepsOne() {
    const openAi = answerWith([
      {
        postId: "1",
        intent: "Wants an apartment",
        reason: "Haifa, up to $2,000",
      },
      { postId: "1", intent: "A duplicate", reason: "" },
      { postId: "999", intent: "Not asked for", reason: "" },
    ]);

    const descriptions = yield* describeTaskMatches(task, null, [
      { post: scoredItemFixture("1"), commentId: null },
    ]).pipe(Effect.provide(openAi));

    assert.deepStrictEqual(descriptions, [
      {
        postId: "1",
        intent: "Wants an apartment",
        reason: "Haifa, up to $2,000",
      },
    ]);
  }));

test("no matches make no AI request", () =>
  Effect.gen(function* noMatchesMakeNo() {
    const openAi = withFakeFetch(
      OpenAiResponses.layer,
      () => {
        throw new Error("unexpected request");
      },
      { OPENAI_API_KEY: "test-key" }
    );

    assert.deepStrictEqual(
      yield* describeTaskMatches(task, null, []).pipe(Effect.provide(openAi)),
      []
    );
  }));

test("a missing description fails the scan instead of an empty opportunity", () =>
  Effect.gen(function* missingDescriptionFailsScan() {
    const openAi = answerWith([
      { postId: "1", intent: "Wants an apartment", reason: "Fits" },
    ]);

    assert.match(
      (yield* Effect.flip(
        describeTaskMatches(task, null, [
          { post: scoredItemFixture("1"), commentId: null },
          { post: scoredItemFixture("2"), commentId: null },
        ]).pipe(Effect.provide(openAi))
      )).message,
      /undescribed/u
    );
  }));

test("a missing OpenAI key is named in the task's scan error", () =>
  Effect.gen(function* missingOpenaiKeyReported() {
    const openAiWithoutKey = withFakeFetch(
      OpenAiResponses.layer,
      () => {
        throw new Error("unexpected request");
      },
      {}
    );

    assert.match(
      (yield* Effect.flip(
        describeTaskMatches(task, null, [
          { post: scoredItemFixture("1"), commentId: null },
        ]).pipe(Effect.provide(openAiWithoutKey))
      )).message,
      /OPENAI_API_KEY/u
    );
  }));

test("descriptions are asked for in the user's app language", () =>
  Effect.gen(function* descriptionsInAppLanguage() {
    const instructions: string[] = [];

    const openAi = withFakeFetch(
      OpenAiResponses.layer,
      async (_input, init) => {
        instructions.push(
          Schema.decodeSync(
            Schema.fromJsonString(
              Schema.Struct({ instructions: Schema.String })
            )
          )(fakeFetchBodyText(init?.body)).instructions
        );

        return await Promise.resolve(
          Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      descriptions: [{ postId: "1", intent: "x", reason: "y" }],
                    }),
                  },
                ],
              },
            ],
          })
        );
      },
      { OPENAI_API_KEY: "test-key" }
    );

    const hebrewUser = {
      seeking: "",
      not_relevant: "",
      offer: "",
      areas: "",
      languages: ["he"],
      app_locale: "he" as const,
    };

    yield* describeTaskMatches(task, hebrewUser, [
      { post: scoredItemFixture("1"), commentId: null },
    ]).pipe(Effect.provide(openAi));
    yield* describeTaskMatches(task, null, [
      { post: scoredItemFixture("1"), commentId: null },
    ]).pipe(Effect.provide(openAi));
    // Without settings, English.
    assert.match(instructions[0] ?? "", /one short Hebrew sentence/u);
    assert.match(instructions[1] ?? "", /one short English sentence/u);
  }));
