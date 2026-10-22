import { describe, it } from "@effect/vitest";
import { Choice } from "deepeval/metrics";

import { evalMemoryId } from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import {
  agentAnswerJudge,
  genderMarkedHebrewWords,
} from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  calledToolNames,
} from "../harness/agent-eval-run-checks";
import { exampleEvalSettings } from "../harness/agent-eval-settings-fixtures";

// The agent's long-term memory (src/agent/memory/long-term-memory.server.ts):
// it saves what the user says will stay true, forgets on request, and uses
// what it remembers in later chats.
const netanyaMemory = {
  id: evalMemoryId,
  content: "לא עובד עם לקוחות מנתניה",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

describe.concurrent("agent memory", () => {
  // A user's chat from 2026-10-12: asked "who am I", the agent named them by
  // the business name and a gendered "אתה"; told their own name, it wrote it
  // over the business name.
  it("does not guess who the user is, and keeps their own name out of the business name", async ({
    expect,
  }) => {
    const asked = await runAgentConversation(
      { settings: exampleEvalSettings },
      ["מי אני?"]
    );

    // Step: the answer gives what the settings say, as the business's
    // details, and does not address the user by gender.
    await expect(agentEvalTestCase(asked)).toPass([
      agentAnswerJudge("Says what it knows, guesses nothing", [
        "`test_case.actual_output` presents נועה קוסמטיקה as the business's name, not as the user's own name.",
        // The ways an answer can go about a name it was never told.
        new Choice({
          question:
            "What does `test_case.actual_output` do about the user's own name, which the agent was never told?",
          options: {
            says_it_does_not_know_it: 1,
            asks_for_it: 1,
            leaves_it_out: 0.5,
            uses_the_business_name_as_it: 0,
            makes_one_up: 0,
          },
        }),
      ]),
    ]);
    // A fixed word list, so code checks it (genderMarkedHebrewWords).
    expect(asked.answer).not.toMatch(genderMarkedHebrewWords);

    const named = await runAgentConversation(
      { settings: exampleEvalSettings },
      ["מי אני?", "קוראים לי גל"]
    );

    // Step: the name is remembered, and the business name stays.
    expect(calledToolNames(named)).toContain("saveAgentMemory");

    const settingsWrites = named.writes.filter(
      (write) => write.table === "user_settings"
    );

    expect(settingsWrites.every((write) => !write.body.includes("גל"))).toBe(
      true
    );
  });

  it("saves a lasting preference the user states", async ({ expect }) => {
    const run = await runAgentConversation({}, ["תזכור שאני לא עובד בשבת"]);
    expect(calledToolNames(run)).toContain("saveAgentMemory");
    const saved = run.writes.find((write) => write.table === "agent_memories");
    expect(saved?.body).toContain("שבת");
  });

  it("keeps a fact a settings field holds in the settings, even when told to remember it", async ({
    expect,
  }) => {
    const run = await runAgentConversation({}, [
      "תזכור שדירות מסחריות לא רלוונטיות לי",
    ]);

    expect(calledToolNames(run)).toContain("updateUserSettings");
    expect(calledToolNames(run)).not.toContain("saveAgentMemory");
    const saved = run.writes.find((write) => write.table === "user_settings");
    expect(saved?.body).toContain("מסחרי");
  });

  it("forgets when the user asks", async ({ expect }) => {
    const run = await runAgentConversation({ memories: [netanyaMemory] }, [
      "תשכח את מה שאמרתי על נתניה, עכשיו אני כן עובד שם",
    ]);

    const changed = calledToolNames(run);
    expect(
      changed.includes("forgetAgentMemories") ||
        changed.includes("updateAgentMemory")
    ).toBe(true);
  });

  it("uses what it remembers in a new chat", async ({ expect }) => {
    const run = await runAgentConversation({ memories: [netanyaMemory] }, [
      "איפה עוד כדאי לי לחפש לקוחות? חשבתי על נתניה או הרצליה",
    ]);

    await expect(agentEvalTestCase(run)).toPass([
      // Stated positively: Jev reads a negation literally, and an answer
      // that names Netanya to rule it out read as a recommendation.
      agentAnswerJudge("Remembers Netanya", [
        "`test_case.actual_output` says that the user does not work with clients from Netanya, or leaves Netanya out for that reason.",
      ]),
    ]);
  });
});
