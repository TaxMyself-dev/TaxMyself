import { describe, it } from "@effect/vitest";

import {
  evalOpportunity,
  evalOpportunityId,
  evalTask,
} from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import {
  agentAnswerJudge,
  agentConversationJudge,
  agentToolFaithfulnessJudge,
} from "../harness/agent-eval-judge";
import {
  agentEvalConversationCase,
  agentEvalTestCase,
  calledToolNames,
  findRunToolCall,
} from "../harness/agent-eval-run-checks";

const whatDidYouFind = "What did you find for me?";

// changeTaskOpportunityStatus's input that marks the eval opportunity
// replied.
const markedReplied = {
  opportunityIds: [evalOpportunityId],
  status: "replied",
};

// The agent reports what the user's tasks found and moves the opportunities
// through their statuses on request.
const opportunityScenario = {
  tasks: [evalTask()],
  opportunities: [evalOpportunity()],
};

describe.concurrent("task opportunities", () => {
  // The chat shows the found opportunities as cards, so the answer adds what
  // the cards leave out; the card's data is the tool's output.
  it("reads what the tasks found when asked", async ({ expect }) => {
    const run = await runAgentConversation(opportunityScenario, [
      whatDidYouFind,
    ]);

    const listed = findRunToolCall(run, "listTaskOpportunities");

    expect(JSON.stringify(listed?.output)).toContain(evalOpportunityId);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Adds what the card leaves out", [
        "`test_case.actual_output` refers to the opportunity that was found or says what to do next with it.",
      ]),
      agentToolFaithfulnessJudge(),
    ]);
  });

  it("marks an opportunity as replied when the user says they answered", async ({
    expect,
  }) => {
    const run = await runAgentConversation(opportunityScenario, [
      whatDidYouFind,
      "I already answered them, mark it",
    ]);

    const changed = findRunToolCall(run, "changeTaskOpportunityStatus");

    expect(changed?.inputParameters).toMatchObject(markedReplied);
  });

  // A lead end to end: the found item, a reply for the user to post
  // themselves, then its status.
  it("takes a lead from the found item to a reply the user posts, then marks it replied", async ({
    expect,
  }) => {
    const run = await runAgentConversation(opportunityScenario, [
      whatDidYouFind,
      "Write me a reply to them",
      "I posted the reply, mark that I answered",
    ]);

    // Step: nothing was sent for the user.
    expect(calledToolNames(run)).not.toContain("sendEmail");
    expect(run.approvals).toEqual([]);

    // Step: the opportunity is marked replied once the user says they posted.
    const changed = findRunToolCall(run, "changeTaskOpportunityStatus");

    expect(changed?.inputParameters).toMatchObject(markedReplied);
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Drafts the reply, then records it", [
        "In `turns`, the assistant's answer to the user turn asking for a reply gives a short reply to the bakery looking for a bookkeeper, for the user to post themselves, and does not say it posted or sent it.",
        "In `turns`, the assistant calls changeTaskOpportunityStatus only in its answer to the user turn saying the reply was posted.",
      ]),
    ]);
  });
});
