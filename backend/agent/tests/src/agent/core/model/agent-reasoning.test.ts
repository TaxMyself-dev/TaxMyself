import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage } from "ai";

import { prepareAppAgentStep } from "../../../../../src/agent/core/agent/app-agent";
import {
  agentTurnReasoningEffort,
  prepareAgentReasoningStep,
} from "../../../../../src/agent/core/model/agent-reasoning";

const adCreationSkill = "ad-creation";

// Each turn starts at low effort and rises with the work: attachments and
// detailed requests, multi-step jobs, tool failures and playbooks, and xhigh
// when the user asks for depth or an ad playbook writes up its evidence.

const ask = (text: string): ModelMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

const loaded = (name: string) => ({
  toolCalls: [{ toolName: "loadAgentSkill", input: { name } }],
  content: [{ type: "tool-call" }],
});

const listed = {
  toolCalls: [{ toolName: "listTrackingTasks", input: {} }],
  content: [],
};

describe("agent reasoning", () => {
  it("a short question stays at low effort", () => {
    assert.strictEqual(
      agentTurnReasoningEffort(ask("מה המשימות שלי?"), []),
      "low"
    );
  });

  it("an attached document or a detailed request starts at medium", () => {
    assert.strictEqual(
      agentTurnReasoningEffort(
        ask('<attached_file name="a.csv">x</attached_file>'),
        []
      ),
      "medium"
    );
    assert.strictEqual(
      agentTurnReasoningEffort(ask("א".repeat(700)), []),
      "medium"
    );
  });

  it("a multi-step turn, a tool error or a playbook raises the effort", () => {
    const question = ask("למה המשימה לא מוצאת כלום?");
    assert.strictEqual(
      agentTurnReasoningEffort(question, [listed, listed, listed]),
      "medium"
    );
    assert.strictEqual(
      agentTurnReasoningEffort(question, [
        { toolCalls: [], content: [{ type: "tool-error" }] },
      ]),
      "medium"
    );
    assert.strictEqual(
      agentTurnReasoningEffort(question, [loaded("task-diagnosis")]),
      "medium"
    );
    assert.strictEqual(
      agentTurnReasoningEffort(question, [loaded(adCreationSkill)]),
      "high"
    );
  });

  it("an update is appended once when the effort rises, and never to lower it", () => {
    const messages: ModelMessage[] = [ask("תכתוב לי מודעות לעסק")];
    // Step 0: nothing calls for more than low.
    assert.strictEqual(
      prepareAgentReasoningStep({ messages, steps: [] }),
      undefined
    );

    // After the ad-creation playbook loads, the next step reasons at high.
    const raised = prepareAgentReasoningStep({
      messages,
      steps: [loaded(adCreationSkill)],
    });

    assert.ok(raised);
    assert.deepStrictEqual(raised.messages.at(-1), {
      role: "system",
      content: "",
      providerOptions: { openai: { reasoningEffortUpdate: "high" } },
    });
    // Already at high: no second update.
    assert.strictEqual(
      prepareAgentReasoningStep({
        messages: raised.messages,
        steps: [loaded(adCreationSkill), listed],
      }),
      undefined
    );
  });

  it("asking for depth (Jev's depth signal) reasons at xhigh from the first step", () => {
    const messages = [ask("תנתח לעומק מה עובד אצל המתחרים שלי")];
    // Without the signal, the words alone no longer decide it.
    assert.strictEqual(
      prepareAgentReasoningStep({ messages, steps: [] }),
      undefined
    );
    const deep = prepareAgentReasoningStep({ messages, steps: [] }, true);
    assert.deepStrictEqual(deep?.messages.at(-1), {
      role: "system",
      content: "",
      providerOptions: { openai: { reasoningEffortUpdate: "xhigh" } },
    });
  });

  it("an ad playbook moves to xhigh once it has gathered its evidence", () => {
    const question = ask("תכתוב לי מודעות לעסק");
    const gathering = [loaded(adCreationSkill), listed, listed];
    assert.strictEqual(agentTurnReasoningEffort(question, gathering), "high");
    assert.strictEqual(
      agentTurnReasoningEffort(question, [
        ...gathering,
        listed,
        listed,
        listed,
      ]),
      "xhigh"
    );
  });

  it("the last allowed step answers with no tools, saying what is left", () => {
    const steps = Array.from({ length: 19 }, () => listed);

    const last = prepareAppAgentStep({
      messages: [ask("תמצא לי רואי חשבון ותשלח לכולם מייל")],
      steps,
    });

    assert.ok(last && "toolChoice" in last && last.toolChoice === "none");
    assert.match(
      JSON.stringify(last?.messages?.at(-1)),
      /last step of this answer, so tools are off/u
    );

    const earlier = prepareAppAgentStep({
      messages: [ask("תמצא לי רואי חשבון")],
      steps: steps.slice(0, 5),
    });

    assert.notProperty(earlier ?? {}, "toolChoice");
  });

  it("several requests in one message start at medium", () => {
    assert.strictEqual(
      agentTurnReasoningEffort(
        ask("תיצור משימה לרואה החשבון ואז תחפש ברשת"),
        []
      ),
      "medium"
    );
    assert.strictEqual(agentTurnReasoningEffort(ask("ואזור חיפה?"), []), "low");
  });

  it("a call repeated with the same input gets a reminder at the third time", () => {
    const twice = prepareAppAgentStep({
      messages: [ask("למה המשימה לא סורקת?")],
      steps: [listed, listed],
    });

    assert.notInclude(JSON.stringify(twice ?? {}), "same input");

    const thrice = prepareAppAgentStep({
      messages: [ask("למה המשימה לא סורקת?")],
      steps: [listed, listed, listed],
    });

    assert.include(
      JSON.stringify(thrice?.messages?.at(-1)),
      "You called listTrackingTasks with the same input 3 times"
    );
  });
});
