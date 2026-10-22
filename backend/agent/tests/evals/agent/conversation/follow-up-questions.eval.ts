import { describe, it } from "@effect/vitest";

import { runAgentConversation } from "../harness/agent-eval-harness";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";

// After an answer ends, questions to ask next are written under it, and
// none while it waits for the user's own answer (agent-follow-up-
// questions.ts). The e2e suite checks that pressing one sends it; whether
// they are written is measured here.
describe.concurrent("follow-up questions", () => {
  // Their own model call may find no good question, so the case measures
  // the rate: 3 answers, at least 2 with questions. The agent wrote them
  // itself before 2026-10-14 and left them out of 3 in 3 here.
  it("offers follow-ups after explaining how the system works", async ({
    expect,
  }) => {
    const runs = await Promise.all(
      [1, 2, 3].map(
        async () =>
          await runAgentConversation({}, [
            "תסביר לי איך הסוכן עובד, מהבקשה ועד שהמשימה נוצרת",
          ])
      )
    );

    const offered = runs.filter((run) => run.followUps.length > 0);
    expect(offered.length).toBeGreaterThanOrEqual(2);
  });

  it("holds follow-ups back while asking the user for details", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ settings: emptyEvalSettings }, [
      "תמצא לי לקוחות",
    ]);

    expect(run.followUps).toStrictEqual([]);
  });
});
