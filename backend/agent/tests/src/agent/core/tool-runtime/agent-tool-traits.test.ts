import { setTimeout as sleep } from "node:timers/promises";

import { assert, it, describe } from "@effect/vitest";
import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../../backend/shared/schema/standard-schema";
import { queueExclusiveAgentTools } from "../../../../../src/agent/core/tool-runtime/agent-tool-exclusive-runner";
import {
  agentToolLeavesNoTrace,
  agentToolNeedsApproval,
  agentToolRunsAlone,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-traits";

const timedTool = (log: string[], label: string) =>
  tool({
    description: label,
    inputSchema: toStandardSchema(Schema.Struct({})),
    execute: async () => {
      log.push(`${label} start`);
      await sleep(20);
      log.push(`${label} end`);

      return label;
    },
  });

describe("agent tool traits", () => {
  // The agent's tool table decides approvals, "try again" and which tools run
  // one at a time; the queue enforces the last one, since the AI SDK runs every
  // call of a step at once.

  it("asks approval for deletions and actions in the user's name", () => {
    assert.isTrue(agentToolNeedsApproval("deleteTrackingTasks"));
    assert.isTrue(agentToolNeedsApproval("sendEmail"));
    assert.isFalse(agentToolNeedsApproval("createTrackingTask"));
    assert.isFalse(agentToolNeedsApproval("searchWeb"));
  });

  it("lets reads of every kind be answered again, but no change", () => {
    for (const read of [
      "listTrackingTasks",
      "readAppKnowledge",
      "searchWeb",
      "askUserQuestion",
    ]) {
      assert.isTrue(agentToolLeavesNoTrace(read), read);
    }

    for (const change of [
      "createTrackingTask",
      "updateUserSettings",
      "deleteTrackingTasks",
      "sendEmail",
    ]) {
      assert.isFalse(agentToolLeavesNoTrace(change), change);
    }
  });

  it("treats a tool it does not know as the riskiest kind", () => {
    assert.isTrue(agentToolNeedsApproval("aToolRemovedLongAgo"));
    assert.isFalse(agentToolLeavesNoTrace("aToolRemovedLongAgo"));
    assert.isTrue(agentToolRunsAlone("aToolRemovedLongAgo"));
  });

  const options = { toolCallId: "call", messages: [], context: {} };

  it("runs changes one at a time, reads side by side", async () => {
    const log: string[] = [];

    const tools = queueExclusiveAgentTools({
      deleteTrackingTasks: timedTool(log, "approval"),
      createTrackingTask: timedTool(log, "write"),
      searchWeb: timedTool(log, "read"),
    });

    await Promise.all([
      tools.deleteTrackingTasks.execute?.({}, options),
      tools.createTrackingTask.execute?.({}, options),
      tools.searchWeb.execute?.({}, options),
    ]);
    // The read runs beside the first change; the second change waits for it
    // to end.
    assert.isBelow(log.indexOf("read start"), log.indexOf("approval end"));
    assert.isBelow(log.indexOf("approval end"), log.indexOf("write start"));
  });

  it("keeps queueing after a queued tool fails", async () => {
    const failing = tool({
      description: "fails",
      inputSchema: toStandardSchema(Schema.Struct({})),
      execute: async (): Promise<string> => {
        await Promise.resolve();
        throw new Error("TASK_NOT_FOUND");
      },
    });

    const log: string[] = [];

    const tools = queueExclusiveAgentTools({
      deleteTrackingTasks: failing,
      createTrackingTask: timedTool(log, "write"),
    });

    const [failed, wrote] = await Promise.allSettled([
      tools.deleteTrackingTasks.execute?.({}, options),
      tools.createTrackingTask.execute?.({}, options),
    ]);

    assert.strictEqual(failed?.status, "rejected");
    assert.deepStrictEqual(wrote, { status: "fulfilled", value: "write" });
  });
});
