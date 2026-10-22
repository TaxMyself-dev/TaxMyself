import { describe, it } from "@effect/vitest";
import { Choice } from "deepeval/metrics";

import { evalWebSearch } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentAnswerJudge } from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  calledToolNames,
} from "../harness/agent-eval-run-checks";
import {
  emptyEvalSettings,
  exampleEvalSettings,
} from "../harness/agent-eval-settings-fixtures";

// The agent keeps the user's profile and goals complete: when a request
// depends on something the settings do not hold, it asks first, saves the
// answer to the settings, and carries on (agent-instructions.ts,
// <missing_details>; agent-user-context.ts, <profile_gaps>).

// Carrying on may search the web for clients: it finds nothing.
const emptyWebSearch = evalWebSearch([]);

describe.concurrent("missing details", () => {
  // A business whose profile lacks what it offers and where it works: the
  // agent gets those first, in any chat (<profile_gaps>).
  const halfFilledBusiness = {
    ...exampleEvalSettings,
    preferences: { ...exampleEvalSettings.preferences, offer: "", areas: "" },
  };

  it("asks for the missing profile details first, even after a greeting", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: halfFilledBusiness }, [
      "hi",
    ]);

    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Asks for the profile gaps", [
        "`test_case.actual_output` asks what the business offers or which areas it works in.",
        // <profile_gaps>: one short message that may say how it helps and
        // asks nothing else.
        "`test_case.actual_output` asks only about what the business offers and the areas it works in: it asks the user no other question, such as what they want to do or find.",
      ]),
    ]);
  });

  it("carries on without the details when the user wants to skip", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: halfFilledBusiness }, [
      "hi",
      "Not now, show me my tasks",
    ]);

    // Step: the agent does what was asked instead of asking again.
    expect(calledToolNames(run)).toContain("listTrackingTasks");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Lets the user skip", [
        new Choice({
          question:
            "What does `test_case.actual_output` do about the business details the user chose to skip?",
          options: {
            carries_on_without_them: 1,
            mentions_them_once_in_passing: 0.5,
            asks_for_them_again: 0,
          },
        }),
      ]),
    ]);
  });

  it("asks what a new user offers and where before looking for clients", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: emptyEvalSettings }, [
      "Find me clients",
    ]);

    expect(calledToolNames(run)).not.toContain("createTrackingTask");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Asks for the missing details", [
        "`test_case.actual_output` asks the user what they offer or sell, or what kind of clients they want.",
        "`test_case.actual_output` asks the user which area or city they work in.",
      ]),
    ]);
  });

  it("saves the user's answer to their settings and carries on", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: emptyEvalSettings, webSearch: emptyWebSearch },
      [
        "Find me clients",
        "I do bookkeeping for small businesses, in Chicago and the suburbs",
      ]
    );

    expect(calledToolNames(run)).toContain("updateUserSettings");
    const saved = run.writes.find((write) => write.table === "user_settings");
    expect(saved?.body).toMatch(/bookkeep/iu);
    expect(saved?.body).toContain("Chicago");
  });

  it("does not ask for what the settings already hold", async ({ expect }) => {
    const run = await runAgentConversation(
      { settings: exampleEvalSettings, webSearch: emptyWebSearch },
      ["Suggest tasks that would bring me clients"]
    );

    expect(calledToolNames(run)).toContain("suggestTrackingTasks");
    // Step: the answer asks nothing, since the settings hold what the ideas
    // need and the ideas show as cards. Checked in code: Jev read questions
    // into answers that asked none, in every wording tried
    // (agent-judges.eval.ts).
    expect(run.answer).not.toContain("?");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Uses the settings it has", [
        "`test_case.actual_output` tells the user that task suggestions were made.",
      ]),
    ]);
  });

  it("asks for the budget before creating a task for buyers", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: exampleEvalSettings }, [
      "Create a task to find people buying a used delivery van",
    ]);

    expect(calledToolNames(run)).not.toContain("createTrackingTask");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Asks for the budget", [
        "`test_case.actual_output` asks the user for a price range or budget.",
      ]),
    ]);
  });
});
