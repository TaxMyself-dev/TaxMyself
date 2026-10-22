import { createOpenAI } from "@ai-sdk/openai";
import { assert, it, describe } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { createAppAgent } from "../../../../../src/agent/core/agent/app-agent";
import { fakeFetchBodyText } from "../../../../backend/shared/fixtures/fake-fetch-request";
import { makeUnusedSupabaseClient } from "../../../../backend/shared/fixtures/fake-supabase-client";
import {
  createEvalOpportunityStore,
  createEvalTaskStore,
} from "../../../../evals/agent/harness/agent-eval-scenario";
import { exampleEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

// Every agent request tells OpenAI to keep no copy (store: false) and names
// the user only by a hash (safety_identifier), never by their id. The
// request is built as the agent sends it and caught before it leaves.

const userId = "6f1c2a1e-1111-4a1a-8a1a-111111111111";

const requestBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      store: Schema.Boolean,
      safety_identifier: Schema.String,
      include: Schema.optional(Schema.Array(Schema.String)),
    })
  )
);

describe("agent openai privacy", () => {
  it("the agent's request keeps no copy at OpenAI and names the user only by a hash", async () => {
    const bodies: string[] = [];

    const model = createOpenAI({
      apiKey: "test",
      fetch: async (_url, init) => {
        bodies.push(fakeFetchBodyText(init?.body));

        return await Promise.reject(new Error("AGENT_TEST_REQUEST_CAUGHT"));
      },
    })("gpt-6-luna");

    const agent = createAppAgent({
      conversationId: "c1",
      userId,
      model,
      // The request fails before any tool runs, so the client is never used.
      supabase: makeUnusedSupabaseClient(),
      settings: exampleEvalSettings,
      tasks: createEvalTaskStore([], []),
      opportunities: createEvalOpportunityStore([], []),
      webSearch: { search: () => Effect.die(new Error("unused")) },
      email: { send: () => Effect.die(new Error("unused")) },
    });

    try {
      await agent.generate({ prompt: "היי" });
    } catch {
      // The fake fetch fails the request once its body is recorded.
    }

    const body = requestBody(bodies[0]);
    assert.isFalse(body.store);
    assert.match(body.safety_identifier, /^gh_[\da-f]{32}$/u);
    assert.notInclude(bodies[0], userId);
    // With store off, the reasoning travels encrypted from step to step.
    assert.include(body.include ?? [], "reasoning.encrypted_content");
  });
});
