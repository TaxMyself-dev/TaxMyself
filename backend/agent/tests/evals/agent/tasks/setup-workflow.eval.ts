import { describe, it } from "@effect/vitest";

import { evalWebSearch } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentConversationJudge } from "../harness/agent-eval-judge";
import {
  agentEvalConversationCase,
  calledToolNames,
  findRunWrite,
} from "../harness/agent-eval-run-checks";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";

// The playbook may search the web for the user's market: it finds nothing.
const emptyWebSearch = evalWebSearch([]);

// A new user's first chat end to end: the agent learns who they are, saves
// it to the settings, and then creates the task they ask for from it.
describe("setup workflow", () => {
  it("saves a new user's details first, then creates their task", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: emptyEvalSettings, webSearch: emptyWebSearch },
      [
        "I'm a bookkeeper, help me find clients",
        "I work in Chicago, doing monthly books and payroll for small businesses",
        "Create a task to find restaurants in Chicago that need a bookkeeper, up to $800 a month",
        "Yes, every hour, with alerts",
      ]
    );

    const tools = calledToolNames(run);
    expect(tools).toContain("updateUserSettings");
    expect(tools).toContain("createTrackingTask");
    expect(tools.indexOf("updateUserSettings")).toBeLessThan(
      tools.indexOf("createTrackingTask")
    );

    const settings = run.writes
      .filter((write) => write.table === "user_settings")
      .map((write) => write.body)
      .join("\n");

    expect(settings).toContain("Chicago");

    const task = findRunWrite(run, "tracking_tasks", "insert");

    expect(task?.body).toContain("Chicago");
    expect(task?.body).toContain("800");
  });

  // Onboarding from one description of the business: the settings are
  // saved and first tasks are suggested (not created).
  it("sets a new business up from its description: settings and suggested tasks", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: emptyEvalSettings, webSearch: emptyWebSearch },
      [
        "I'm new here. I install and repair air conditioners in Phoenix and around it, and I'm looking for private customers. Help me get started",
        // The playbook's remaining questions (the ideal customer, what is
        // never relevant), answered.
        "Home owners and renters. Not relevant: tenders and big commercial jobs",
      ]
    );

    const tools = calledToolNames(run);
    // Step: the business went to the settings.
    expect(tools).toContain("updateUserSettings");

    const settings = run.writes
      .filter((write) => write.table === "user_settings")
      .map((write) => write.body)
      .join("\n");

    expect(settings).toContain("Phoenix");
    // Step: first tasks were suggested as cards; none was created.
    expect(tools).toContain("suggestTrackingTasks");
    expect(tools).not.toContain("createTrackingTask");
    // The setup may finish in either answer, so the whole chat is judged.
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Says what happens next", [
        "In `turns`, an assistant answer says what happens next: that the tasks keep scanning and matches arrive as opportunities, or that the suggested tasks start once the user adds them.",
      ]),
    ]);
  });
});
