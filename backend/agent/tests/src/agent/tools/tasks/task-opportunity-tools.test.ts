import { assert, effect as test } from "@effect/vitest";
import { Effect } from "effect";

import { agentTaskOpportunitySummary } from "../../../../../src/agent/tools/tasks/task-opportunity-tools";
import { readStoredTaskOpportunities } from "../../../../../src/server/tasks/task-opportunity-storage.server";
import { makeFakeSupabaseClient } from "../../../../backend/shared/fixtures/fake-supabase-client";
import { evalOpportunityRow } from "../../../../evals/agent/harness/agent-eval-fixtures";

// listTaskOpportunities gives the agent each match as stored with its item:
// where it was found, the item's title, link and text, and the matching
// reply's text when a reply is the match.

const summaries = (row: ReturnType<typeof evalOpportunityRow>) =>
  readStoredTaskOpportunities(
    makeFakeSupabaseClient(
      async () =>
        await Promise.resolve(
          Response.json([row], { headers: { "Content-Range": "0-0/1" } })
        ),
      {
        getClaims: async () =>
          await Promise.resolve({ data: null, error: null }),
      }
    ),
    { taskId: null, statuses: [], minScore: 0, page: 0 }
  ).pipe(
    Effect.map(({ opportunities }) =>
      opportunities.map(agentTaskOpportunitySummary)
    )
  );

const request = "Our bakery needs someone to do the books every month.";

test("an opportunity names its source, its item's title and link, and its text", () =>
  Effect.gen(function* itemGiven() {
    const [summary] = yield* summaries(evalOpportunityRow(request));

    assert.deepStrictEqual(
      {
        source: summary?.source,
        title: summary?.title,
        url: summary?.url,
        text: summary?.text,
        reply: summary?.reply,
      },
      {
        source: "web",
        title: "Bakery looking for a bookkeeper",
        url: "https://example.com/requests/111",
        text: request,
        reply: null,
      }
    );
  }));

test("a reply that is the match is given as the reply's text", () =>
  Effect.gen(function* replyGiven() {
    const [summary] = yield* summaries(
      evalOpportunityRow(
        "Who does bookkeeping around here?",
        [{ id: "c-1", text: "I need one for my cafe, monthly" }],
        "c-1"
      )
    );

    assert.strictEqual(summary?.reply, "I need one for my cafe, monthly");
  }));
