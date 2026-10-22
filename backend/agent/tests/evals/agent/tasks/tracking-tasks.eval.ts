import { describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  evalTask,
  evalTaskId,
  evalWebSearch,
} from "../harness/agent-eval-fixtures";
import { runAgentConversation } from "../harness/agent-eval-harness";
import {
  agentAnswerJudge,
  agentConversationJudge,
  agentToolFaithfulnessJudge,
  trackingLeftToUserQuestion,
} from "../harness/agent-eval-judge";
import {
  agentEvalConversationCase,
  agentEvalTestCase,
  calledToolNames,
  findRunToolCall,
  findRunWrite,
} from "../harness/agent-eval-run-checks";

// The agent runs the user's tracking tasks from the chat: creates, lists,
// pauses and scans them, says what the monitor did, and finds why a task
// finds nothing.

const bakeryLeads = evalWebSearch([
  {
    title: "Bakery in Logan Square looking for a bookkeeper",
    url: "https://example.com/requests/201",
    snippet: "We need someone to do our books every month, starting November.",
  },
  {
    title: "New café needs payroll and bookkeeping",
    url: "https://example.com/requests/202",
    snippet: "Opening in Wicker Park, looking for a part-time bookkeeper.",
  },
]);

describe.concurrent("tracking tasks", () => {
  it("creates a task once its setup is agreed", async ({ expect }) => {
    const run = await runAgentConversation({}, [
      "Create a task to find bakeries in Chicago that need a bookkeeper",
      "Yes, every hour, with alerts",
    ]);

    expect(calledToolNames(run)).toContain("createTrackingTask");

    const created = findRunWrite(run, "tracking_tasks", "insert");

    expect(created?.body).toMatch(/bakery|bakeries/iu);
    // Step: the task was created only once the user agreed to its setup.
    await expect(agentEvalConversationCase(run)).toPass([
      agentConversationJudge("Creates the task after the user agrees", [
        "In `turns`, the assistant calls createTrackingTask only in its answer to a user turn that agrees to the task's setup, never before that turn.",
      ]),
    ]);
  });

  // Asked for results now, the agent searches once and leaves ongoing
  // tracking to the user: a task keeps scanning, so it is never created
  // without asking.
  it("searches once for a request for results now, without creating a task", async ({
    expect,
  }) => {
    const run = await runAgentConversation({ webSearch: bakeryLeads }, [
      "Find me 2 bakeries in Chicago looking for a bookkeeper right now",
    ]);

    expect(calledToolNames(run)).not.toContain("createTrackingTask");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge(
        "Leaves tracking to the user",
        [trackingLeftToUserQuestion()],
        0.5
      ),
    ]);
  });

  it("lists the user's tasks by their sentence", async ({ expect }) => {
    const run = await runAgentConversation({ tasks: [evalTask()] }, [
      "What are my tasks?",
    ]);

    expect(calledToolNames(run)).toContain("listTrackingTasks");
    expect(run.output).toMatch(/bookkeeper/iu);
    expect(run.output).not.toContain(evalTaskId);
  });

  it("pauses the task the user names", async ({ expect }) => {
    const run = await runAgentConversation({ tasks: [evalTask()] }, [
      "Pause the bookkeeper task",
    ]);

    expect(calledToolNames(run)).toContain("updateTrackingTask");

    const paused = findRunWrite(run, "tracking_tasks", "update");

    expect(paused?.body).toContain('"status":"paused"');
  });

  it("changes the budget of the task the user names", async ({ expect }) => {
    const run = await runAgentConversation({ tasks: [evalTask()] }, [
      "In the bookkeeper task, the budget is up to $1,200 a month",
    ]);

    expect(calledToolNames(run)).toContain("updateTrackingTask");

    const changed = findRunWrite(run, "tracking_tasks", "update");

    expect(changed?.body).toMatch(/1[,.]?200/u);
  });

  it("suggests new tasks when the user explores what to track", async ({
    expect,
  }) => {
    // The agent may search the web to ground its ideas.
    const run = await runAgentConversation(
      { tasks: [evalTask()], webSearch: bakeryLeads },
      ["What else is worth tracking for me?"]
    );

    const tools = calledToolNames(run);
    expect(tools).toContain("listTrackingTasks");
    expect(tools).toContain("suggestTrackingTasks");

    const suggested = findRunToolCall(run, "suggestTrackingTasks");

    // The suggestions are tasks the user does not track yet.
    const suggestedSentences = Schema.decodeUnknownSync(
      Schema.Struct({
        tasks: Schema.Array(Schema.Struct({ sentence: Schema.String })),
      })
    )(suggested?.inputParameters).tasks.map((task) => task.sentence);

    expect(suggestedSentences.length).toBeGreaterThan(0);
    expect(suggestedSentences).not.toContain(evalTask().sentence);
  });

  it("scans a task now when asked", async ({ expect }) => {
    const run = await runAgentConversation(
      { tasks: [evalTask({ status: "active" })] },
      ["Scan the bookkeeper task now"]
    );

    expect(calledToolNames(run)).toContain("scanTrackingTaskNow");

    const requested = findRunWrite(run, "tracking_tasks", "update");

    expect(requested?.body).toContain("scanRequested");
  });

  it("reports what the last scans found", async ({ expect }) => {
    const run = await runAgentConversation(
      {
        tasks: [evalTask()],
        scanRuns: [
          {
            id: "8c1c2a1e-4444-4a1a-8a1a-444444444444",
            taskId: evalTaskId,
            status: "succeeded",
            sourcesScanned: 3,
            itemsScored: 27,
            matches: 0,
            error: null,
            startedAt: "2026-10-04T09:00:00.000Z",
            finishedAt: "2026-10-04T09:04:00.000Z",
          },
        ],
      },
      ["What happened in the latest scans?"]
    );

    expect(calledToolNames(run)).toContain("listRecentScans");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Reports the scan", [
        "`test_case.actual_output` says that 3 sources were scanned and 27 items were checked.",
        "`test_case.actual_output` says that no opportunities were found.",
      ]),
      agentToolFaithfulnessJudge(),
    ]);
  });

  // A task that scans fine, but whose only source searches another city:
  // the cause is the source.
  it("finds why a task finds nothing and offers one fix, changing nothing yet", async ({
    expect,
  }) => {
    const run = await runAgentConversation(
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
            id: "8c1c2a1e-5555-4a1a-8a1a-555555555555",
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
      ["Why hasn't the Chicago bookkeeper task found anything for a week?"]
    );

    const tools = calledToolNames(run);
    // Step: the agent checked the task.
    expect(tools).toContain("listTrackingTasks");
    // Step: nothing changed before the user agreed to the fix.
    expect(tools).not.toContain("updateTrackingTask");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Names the cause and one fix", [
        "`test_case.actual_output` says the task's source searches Miami, not Chicago, or otherwise does not fit the task's area.",
        "`test_case.actual_output` offers to change the source to Chicago, or asks whether to.",
      ]),
      agentToolFaithfulnessJudge(),
    ]);
  });
});
