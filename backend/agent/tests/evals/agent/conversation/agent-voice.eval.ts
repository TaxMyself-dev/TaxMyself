import { describe, it } from "@effect/vitest";

import { evalTask } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import {
  genderMarkedHebrewWords,
  hebrewVoiceJudge,
} from "../harness/agent-eval-judge";
import { agentEvalTestCase } from "../harness/agent-eval-run-checks";

// How the agent sounds (agent-instructions.ts, <voice> and the Hebrew
// <app_language>): everyday Hebrew, straight to the point, no chatbot
// phrases, real lists. Write the same cases for every language you ship.
describe.concurrent("agent voice", () => {
  it("greets back in a few words", async ({ expect }) => {
    const run = await runAgentConversation({ locale: "he" }, ["היי"]);
    expect(run.answer.length).toBeLessThan(120);
    await expect(agentEvalTestCase(run)).toPass([hebrewVoiceJudge()]);
  });

  it("answers about the user's tasks in plain Hebrew", async ({ expect }) => {
    const run = await runAgentConversation(
      {
        locale: "he",
        tasks: [evalTask({ sentence: "למצוא רואה חשבון לדוח הרבעוני" })],
      },
      ["מה המשימות שלי?"]
    );

    await expect(agentEvalTestCase(run)).toPass([hebrewVoiceJudge()]);
  });

  it("explains how the system works without assuming the user's gender", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ locale: "he" }, [
      "איך זה עובד בכלל?",
    ]);

    await expect(agentEvalTestCase(run)).toPass([hebrewVoiceJudge()]);
    // A fixed word list has one exact answer, so code checks it: on
    // 2026-10-10 the Jev judge put 0.34 on an answer it had to read word by
    // word (TypeSafe's jev-1.13 jaggedness: literal reading).
    expect(run.answer).not.toMatch(genderMarkedHebrewWords);
  });

  it("writes a list as real list lines, not inline bullets", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ locale: "he" }, [
      "תן לי שלושה רעיונות למשימות לעסק של הנהלת חשבונות",
    ]);

    expect(run.output).not.toMatch(/•.*•/u);
  });
});
