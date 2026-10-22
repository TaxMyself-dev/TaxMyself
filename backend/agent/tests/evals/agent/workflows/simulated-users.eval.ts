import { describe, it } from "@effect/vitest";

import {
  evalOpportunity,
  evalOpportunityId,
  evalTask,
  evalTaskId,
} from "../harness/agent-eval-fixtures";
import { agentConversationJudge } from "../harness/agent-eval-judge";
import {
  agentEvalConversationCase,
  calledToolNames,
  findRunToolCall,
  findRunWrite,
} from "../harness/agent-eval-run-checks";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";
import { runSimulatedAgentConversation } from "../harness/agent-eval-simulated-user";
import {
  chicagoBookkeeperPersona,
  createSimulatedEmail,
  createSimulatedWebSearch,
  denyEmailsApprovals,
} from "./simulated-users-eval-sources";

// One simulated user per workflow the agent owns: gpt-6-luna plays the user
// from a fixed opening (agent-eval-simulated-user.ts), with a denial or a
// change of mind where the workflow has one. The checks read the end state
// (what was saved, created and sent), and a judge reads the whole chat.
// EXAMPLE workflows: write one per workflow of your product.

const neverSentStatement =
  "In `turns`, no assistant turn says an email was sent: every email card was denied.";

describe.concurrent("simulated users", () => {
  // Find something now. The user changes the budget, then asks to email the
  // lead and denies the card.
  it("a lead hunt: a changed budget, then a denied email", async ({
    expect,
  }) => {
    const { email, emailsSent } = createSimulatedEmail();

    const run = await runSimulatedAgentConversation(
      {
        webSearch: createSimulatedWebSearch(),
        email,
        settings: emptyEvalSettings,
      },
      {
        persona: chicagoBookkeeperPersona,
        goal: "Find small businesses in Chicago that want a bookkeeper. Start by saying they pay at least $500 a month; once you see the results, say $800 is the minimum. Then ask the agent to email the lead that fits. Done once the agent says what happened with the email.",
        opening:
          "Find me small businesses in Chicago looking for a bookkeeper, paying at least $500 a month",
        approvals: denyEmailsApprovals,
      }
    );

    expect(calledToolNames(run)).toContain("searchWeb");
    // Step: the denied email was not sent.
    expect(emailsSent).toEqual([]);
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Finds the lead and respects the denial", [
        "In `turns`, after the user sets $800 as the minimum, the assistant presents the café group that pays $900 a month, with its link.",
        neverSentStatement,
      ]),
    ]);
  });

  // A task set up with the user, its frequency changed before agreeing.
  it("a task set up with the user, its frequency changed before it starts", async ({
    expect,
  }) => {
    const run = await runSimulatedAgentConversation(
      { webSearch: createSimulatedWebSearch() },
      {
        persona: chicagoBookkeeperPersona,
        goal: "A task that keeps finding restaurants in Chicago that need a bookkeeper. When the agent proposes the setup, ask for a scan every 6 hours instead of what it proposed (or keep it if it proposed that, and ask for alerts on). Agree once it is right. Done when the agent says the task was created.",
        opening:
          "Keep finding me restaurants in Chicago that need a bookkeeper",
        approvals: "Approve anything the user asked for.",
      }
    );

    const task = findRunWrite(run, "tracking_tasks", "insert");

    expect(task, "the task was created").toBeDefined();
    expect(task?.body ?? "").toContain("Chicago");
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Creates the task only once agreed", [
        "In `turns`, the assistant calls createTrackingTask only after a user turn that agrees to the task's setup.",
      ]),
    ]);
  });

  // A lead from its item to a reply: the user wants it emailed, denies the
  // card, sends the reply themselves and asks to mark it.
  it("a lead: a drafted reply, a denied email, then marked replied", async ({
    expect,
  }) => {
    const { email, emailsSent } = createSimulatedEmail();

    const run = await runSimulatedAgentConversation(
      {
        email,
        tasks: [evalTask()],
        opportunities: [evalOpportunity()],
      },
      {
        persona: chicagoBookkeeperPersona,
        goal: "See what your task found, get a reply written for the bakery, and ask the agent to email it to them. When the card comes, deny it. Then say you wrote to them yourself and ask to mark the lead as answered. Done once it is marked.",
        opening: "What did you find for me today?",
        approvals: denyEmailsApprovals,
      }
    );

    expect(emailsSent).toEqual([]);

    const changed = findRunToolCall(run, "changeTaskOpportunityStatus");

    expect(changed?.inputParameters).toMatchObject({
      opportunityIds: [evalOpportunityId],
      status: "replied",
    });
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Drafts, respects the denial, records", [
        "In `turns`, the assistant writes a short reply to the bakery looking for a bookkeeper.",
        neverSentStatement,
      ]),
    ]);
  });

  // Getting started, from a description of the business.
  it("a new business set up from its description", async ({ expect }) => {
    const run = await runSimulatedAgentConversation(
      { settings: emptyEvalSettings, webSearch: createSimulatedWebSearch() },
      {
        persona:
          "A new user who runs a small moving company in Austin, serving private homes.",
        goal: "Get started: answer the agent's questions briefly (private homes, never offices), and leave with tasks suggested. Do not ask for tasks to be created; you will add them yourself. Done once the agent says what happens next.",
        opening:
          "I'm new here. I have a small moving company in Austin. How do I start?",
        approvals: denyEmailsApprovals,
      }
    );

    const tools = calledToolNames(run);
    expect(tools).toContain("updateUserSettings");
    expect(tools).toContain("suggestTrackingTasks");
    expect(tools).not.toContain("createTrackingTask");

    const settings = run.writes
      .filter((write) => write.table === "user_settings")
      .map((write) => write.body)
      .join("\n");

    expect(settings).toContain("Austin");
  });

  // Task health. The user agrees to the fix the agent offers.
  it("a task that finds nothing: diagnosed, and fixed once the user agrees", async ({
    expect,
  }) => {
    const run = await runSimulatedAgentConversation(
      {
        tasks: [
          evalTask({
            sentence:
              "Find small businesses in Chicago looking for a bookkeeper",
            location: "Chicago",
            sources: [{ kind: "web", query: "bookkeeper wanted Miami" }],
            status: "active",
          }),
        ],
        scanRuns: [
          {
            id: "8c1c2a1e-6666-4a1a-8a1a-666666666666",
            taskId: evalTaskId,
            status: "succeeded",
            sourcesScanned: 1,
            itemsScored: 40,
            matches: 0,
            error: null,
            startedAt: "2026-10-04T09:00:00.000Z",
            finishedAt: "2026-10-04T09:03:00.000Z",
          },
        ],
      },
      {
        persona: chicagoBookkeeperPersona,
        goal: "Find out why your bookkeeper task finds nothing. Agree to the fix the agent offers. Done once the agent says the fix is done.",
        opening: "Why does my task find nothing?",
        approvals: "Approve anything the user asked for.",
      }
    );

    const fixed = findRunWrite(run, "tracking_tasks", "update");

    // Step: the fix, a source for Chicago, came after the user agreed.
    expect(fixed?.body ?? "").toContain("Chicago");
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Names the cause, fixes on agreement", [
        "In `turns`, the assistant says the task's source searches Miami, not Chicago.",
        "In `turns`, the assistant changes the task only after a user turn that agrees to it.",
      ]),
    ]);
  });
});
