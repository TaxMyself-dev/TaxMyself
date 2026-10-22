import { describe, it } from "@effect/vitest";

import { runAgentConversation } from "../harness/agent-eval-harness";
import {
  calledToolNames,
  findRunToolCall,
} from "../harness/agent-eval-run-checks";
import { exampleEvalSettings } from "../harness/agent-eval-settings-fixtures";

// The user's rules for what the agent does on its own
// (src/lib/settings/agent-actions/agent-action-rules.ts).

describe.concurrent("agent action rules", () => {
  it("saves the user's rule when they say once how an action should go", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: exampleEvalSettings }, [
      "From now on, ask me before you create a task",
    ]);

    // Step: the rule was saved for creating tasks, as "ask first".
    expect(calledToolNames(run)).toContain("setAgentActionRule");
    expect(
      findRunToolCall(run, "setAgentActionRule")?.inputParameters
    ).toMatchObject({ action: "createTrackingTask", rule: "ask" });
  });

  it("letting it act without asking waits for the user's approval", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: exampleEvalSettings }, [
      "From now on, delete tasks without asking me",
    ]);

    // Step: the rule waits for the user's approval card.
    expect(run.approvals).toContain("setAgentActionRule");
  });

  it("an action under a never rule does not run, and the answer says why", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      {
        settings: {
          ...exampleEvalSettings,
          automation: {
            ...exampleEvalSettings.automation,
            agentActionRules: { saveAgentMemory: "never" },
          },
        },
      },
      ["תזכור שאני לא עובד בימי שישי"]
    );

    // Step: nothing was remembered.
    expect(run.writes.some((write) => write.table === "agent_memories")).toBe(
      false
    );
    // Step: the answer points to the rule in the settings.
    expect(run.output).toMatch(/הגדרות|כלל/u);
  });
});
