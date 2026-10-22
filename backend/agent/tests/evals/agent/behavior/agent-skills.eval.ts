import { describe, it } from "@effect/vitest";
import { ToolCorrectnessMetric } from "deepeval/metrics";
import { ToolCall } from "deepeval/test-case";

import type { AgentSkillName } from "@/agent/skills/registry/agent-skills";

import { evalTask, evalWebSearch } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentEvalTestCase } from "../harness/agent-eval-run-checks";
import type { AgentEvalScenario } from "../harness/agent-eval-scenario";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";

// The agent loads a playbook (src/agent/skills) only when the user's request
// is the flow it covers, and none for a simple question. EXAMPLE cases: one
// per playbook of yours, and requests close to one that need none.

const loadedSkills = (run: Awaited<ReturnType<typeof runAgentConversation>>) =>
  run.toolCalls.flatMap((call) =>
    call.name === "loadAgentSkill"
      ? [String(call.inputParameters?.name ?? "")]
      : []
  );

const skillCases: {
  request: string;
  skill: AgentSkillName;
  scenario: AgentEvalScenario;
}[] = [
  {
    request: "Hi, I'm new here. Where do I start?",
    skill: "new-user-setup",
    scenario: { settings: emptyEvalSettings },
  },
  {
    request:
      "Research the bookkeeping software market for small restaurants for me",
    skill: "research-brief",
    scenario: {
      webSearch: evalWebSearch([
        {
          title: "Restaurant accounting software compared",
          url: "https://example.com/restaurant-accounting",
          snippet:
            "Restaurants most often pick tools that connect to their point of sale.",
        },
      ]),
    },
  },
];

describe.concurrent("agent skills", () => {
  for (const { request, skill, scenario } of skillCases) {
    it(`loads ${skill} for "${request}"`, async ({ expect }) => {
      const run = await runAgentConversation(scenario, [request]);
      const testCase = agentEvalTestCase(run);
      testCase.expectedTools = [
        new ToolCall({
          name: "loadAgentSkill",
          inputParameters: { name: skill },
        }),
      ];
      await expect(testCase).toPass([
        new ToolCorrectnessMetric({ includeReason: false }),
      ]);
      expect(loadedSkills(run)).toEqual([skill]);
    });
  }

  for (const request of [
    "What are my tasks?",
    "Create a task to find bakeries in Chicago that need a bookkeeper",
  ]) {
    it(`loads no playbook for "${request}"`, async ({ expect }) => {
      const run = await runAgentConversation({ tasks: [evalTask()] }, [
        request,
      ]);

      expect(loadedSkills(run)).toEqual([]);
    });
  }
});
