import { createOpenAI } from "@ai-sdk/openai";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import type { AgentHarnessOverride } from "../../../../../src/agent/core/agent/agent-harness-override";
import { agentInstructions } from "../../../../../src/agent/core/agent/agent-instructions";
import { createAppAgent } from "../../../../../src/agent/core/agent/app-agent";
import { fakeFetchBodyText } from "../../../../backend/shared/fixtures/fake-fetch-request";
import { makeUnusedSupabaseClient } from "../../../../backend/shared/fixtures/fake-supabase-client";
import {
  createEvalOpportunityStore,
  createEvalTaskStore,
} from "../../../../evals/agent/harness/agent-eval-scenario";
import { exampleEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

// A candidate harness (agent harnessing) reaches OpenAI as the agent's
// instructions and tool descriptions; without one, the request is the
// agent's own. The request is built as the agent sends it and caught before
// it leaves.

// The body of the agent's first request, with the given harness.
const firstRequestBody = async (harness?: AgentHarnessOverride) => {
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
    userId: "6f1c2a1e-1111-4a1a-8a1a-111111111111",
    model,
    // The request fails before any tool runs, so the client is never used.
    supabase: makeUnusedSupabaseClient(),
    settings: exampleEvalSettings,
    tasks: createEvalTaskStore([], []),
    opportunities: createEvalOpportunityStore([], []),
    webSearch: { search: () => Effect.die(new Error("unused")) },
    email: { send: () => Effect.die(new Error("unused")) },
    harness,
  });

  try {
    await agent.generate({ prompt: "hi" });
  } catch {
    // The fake fetch fails the request once its body is recorded.
  }

  return bodies[0] ?? "";
};

describe("agent harness override", () => {
  it("a harness's instructions and tool description replace the agent's own", async () => {
    const body = await firstRequestBody({
      instructions: "HARNESS_INSTRUCTIONS_MARKER",
      toolDescriptions: { listTrackingTasks: "HARNESS_TOOL_MARKER" },
    });

    assert.include(body, "HARNESS_INSTRUCTIONS_MARKER");
    assert.include(body, "HARNESS_TOOL_MARKER");
    assert.notInclude(body, "You are the YourApp agent");
  });

  it("without a harness the request carries the agent's own instructions", async () => {
    const body = await firstRequestBody();
    const ownStart = agentInstructions().slice(0, 60);

    assert.include(body, JSON.stringify(ownStart).slice(1, -1));
    assert.notInclude(body, "HARNESS_TOOL_MARKER");
  });

  it("a description for a tool the agent does not have changes nothing", async () => {
    const body = await firstRequestBody({
      toolDescriptions: { noSuchTool: "HARNESS_UNKNOWN_TOOL_MARKER" },
    });

    assert.notInclude(body, "HARNESS_UNKNOWN_TOOL_MARKER");
  });
});
