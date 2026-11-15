import { describe, it } from "@effect/vitest";

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

// KeepInTax Phase 3.1 (plan §2.10, Appendix A F1-F3, A19): inverted. The
// template's cases here asserted that the agent asks for missing profile
// details first, in any chat (<profile_gaps>, <missing_details>). That
// behavior is removed: whatever the settings hold or lack, an ordinary
// message gets no question about the user, their profile or their goals, and
// nothing is written to the settings. Onboarding is started by the user
// (Phase 4).

// What a message must not lead to: any write to the user's settings or
// memory.
const wroteAboutTheUser = (
  run: Awaited<ReturnType<typeof runAgentConversation>>
) =>
  run.writes.some(
    (write) =>
      write.table === "user_settings" || write.table === "agent_memories"
  );

// Worded positively after the final run (KT-108): the negative statement
// read correct greetings ("היי! אפשר לבדוק כאן הוצאות…") as unclear at
// confidence 0.06-0.36. Same meaning: a greeting may ask what they want help
// with now, never about the user. The follow-up buttons are questions the
// user may press, and they too must not ask about the user.
const noProfileQuestion = agentAnswerJudge("Asks nothing about the user", [
  "`test_case.actual_output` greets the user and offers help with KeepInTax; if the agent's answer or its follow-up buttons hold a question, it is only about what to help with now, never about the user themselves (their business profile, what they offer or look for, their goals or preferences) or what to search for later.",
]);

describe.concurrent("no unsolicited profile questions", () => {
  // A business whose profile lacks what it offers and where it works: the
  // template asked for those first.
  const halfFilledBusiness = {
    ...exampleEvalSettings,
    preferences: { ...exampleEvalSettings.preferences, offer: "", areas: "" },
  };

  it("a greeting gets a greeting back, with empty settings", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: emptyEvalSettings, locale: "he" },
      ["היי"]
    );

    expect(wroteAboutTheUser(run)).toBe(false);
    expect(calledToolNames(run)).not.toContain("updateUserSettings");
    await expect(agentEvalTestCase(run)).toPass([noProfileQuestion]);
  });

  it("a greeting gets a greeting back, with a half-filled business profile", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: halfFilledBusiness, locale: "he" },
      ["היי"]
    );

    expect(wroteAboutTheUser(run)).toBe(false);
    await expect(agentEvalTestCase(run)).toPass([noProfileQuestion]);
  });

  it("asked what it knows about the user, it says what it holds and asks for nothing", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
      { settings: emptyEvalSettings, locale: "he" },
      ["מה אתה יודע עליי?"]
    );

    expect(wroteAboutTheUser(run)).toBe(false);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Says what it holds, asks for nothing", [
        "`test_case.actual_output` says, in a few words, what it knows about the user (little or nothing), without inventing anything about them.",
        "`test_case.actual_output` does not ask the user for their name or any other detail about themselves.",
      ]),
    ]);
  });
});
