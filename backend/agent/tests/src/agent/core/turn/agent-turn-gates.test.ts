import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage } from "ai";

import { createAgentStopHooks } from "../../../../../src/agent/core/turn/agent-stop-hooks";
import { agentToolSearchEnding } from "../../../../../src/agent/core/turn/agent-turn-gates";

// The turn gates send an answer back once when it ends in a shape seen
// failing in eval runs, and stay quiet on the correct neighbors of each
// shape.

const call = (toolName: string) => ({ toolName, input: {} });

const toolSearch = (tools: unknown[]) => ({
  text: "",
  toolCalls: [{ toolName: "toolSearch", input: {}, providerExecuted: true }],
  toolResults: [{ toolName: "toolSearch", output: { tools } }],
});

const work = (toolName: string) => ({
  text: "",
  toolCalls: [call(toolName)],
  toolResults: [{ toolName, output: {} }],
});

const answer = (text: string) => ({ text, toolCalls: [], toolResults: [] });

const loaded = [{ type: "namespace", name: "email" }];

describe("tool search gate", () => {
  // final-1016c: findSimilarAds, then three searches for the save tool
  // that came back empty, then "אין לי כרגע גישה לכלי השמירה".
  it("fires when the answer ends on an empty search after the last tool", () => {
    assert.strictEqual(
      agentToolSearchEnding([
        toolSearch(loaded),
        work("findSimilarAds"),
        toolSearch([]),
        answer("אין לי כרגע גישה לכלי השמירה, ולכן המודעות לא נשמרו."),
      ]),
      "empty"
    );
  });

  // The email tools loaded, then the answer ended with no email card.
  it("fires when the answer ends on a search whose tools it never called", () => {
    assert.strictEqual(
      agentToolSearchEnding([
        work("listTrackingTasks"),
        toolSearch([{ type: "namespace", name: "email" }]),
        answer("I'll write Dana an email about the report."),
      ]),
      "loaded"
    );
  });

  it("stays quiet when the loaded tool was called", () => {
    assert.isNull(
      agentToolSearchEnding([
        toolSearch(loaded),
        work("sendEmail"),
        answer("The email waits for your approval."),
      ])
    );
  });

  // An empty search, then the agent called the loaded tool, as it should.
  it("stays quiet when a tool ran after the empty search", () => {
    assert.isNull(
      agentToolSearchEnding([
        toolSearch([]),
        work("sendEmail"),
        answer("The email waits for your approval."),
      ])
    );
  });
});

const user = (text: string): ModelMessage => ({ role: "user", content: text });

describe("turn gates in the stop hooks", () => {
  it("each gate sends an answer back once", async () => {
    const hooks = createAgentStopHooks();
    const messages = [user("Email Dana about the report")];
    const steps = [toolSearch([]), answer("I emailed Dana.")];

    assert.include(
      JSON.stringify(await hooks(steps, messages)),
      "already loaded"
    );
    assert.isNull(await hooks(steps, messages));
  });
});
