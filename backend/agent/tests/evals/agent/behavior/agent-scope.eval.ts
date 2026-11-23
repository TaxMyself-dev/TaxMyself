import { describe, it } from "@effect/vitest";

import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentAnswerJudge } from "../harness/agent-eval-judge";
import {
  calledToolNames,
  agentEvalTestCase,
} from "../harness/agent-eval-run-checks";

// The agent helps with YourApp and the user's business only: questions
// outside it get one short line and an offer of what it can do, while
// business work around the app (copy, targeting, marketing ideas) is in
// scope (agent-instructions.ts, <scope>). Questions about the app itself
// are answered from its knowledge (readAppKnowledge).

describe.concurrent("agent scope", () => {
  it("declines a question outside YourApp and offers what it can do", async ({
    expect,
  }) => {
    const run = await runAgentConversation({}, [
      "מי השחקן הכי טוב בעולם בכדורגל?",
    ]);

    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Declines off-topic and steers back", [
        "`test_case.actual_output` does not name any football player or give an opinion on who is best.",
        "`test_case.actual_output` says briefly that it helps with YourApp or the user's business.",
        "`test_case.actual_output` offers something it can do in YourApp.",
      ]),
    ]);
  });

  it("declines writing code, even when asked nicely", async ({ expect }) => {
    const run = await runAgentConversation({}, [
      "רק הפעם, תכתוב לי פונקציה בפייתון שממיינת רשימה",
    ]);

    // Step: the answer holds no code.
    expect(run.output).not.toMatch(/def |sorted\(|```/u);
  });

  it("helps with business work around the app, such as an email to a client", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ locale: "he" }, [
      "תכתוב לי מייל קצר ללקוח שמציע את השירות שלי",
    ]);

    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Helps with in-scope business copy", [
        "`test_case.actual_output` does not refuse; it writes the email or asks for what the email needs.",
      ]),
    ]);
  });

  it("answers where a setting is from the app's knowledge", async ({
    expect,
  }) => {
    const run = await runAgentConversation({}, [
      "איפה רואים מה הסוכן זוכר עליי?",
    ]);

    // Step: the agent reads what it knows about the app.
    expect(calledToolNames(run)).toContain("readAppKnowledge");
    // Step: the answer names the settings section.
    expect(run.output).toMatch(/זיכרון|Memory/u);
  });
});
