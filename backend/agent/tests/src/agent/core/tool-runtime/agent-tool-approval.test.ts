import { assert, describe, it } from "@effect/vitest";
import { Option, Schema } from "effect";

import {
  agentChatToolApproval,
  agentToolApproval,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-approval";
import { agentToolNeedsApproval } from "../../../../../src/agent/core/tool-runtime/agent-tool-traits";
import {
  agentActionRuleActions,
  agentRuleActions,
} from "../../../../../src/lib/settings/agent-actions/agent-action-rules";

// The user's rules decide whether an agent action runs, asks first or never
// runs (agent-action-rules.ts); without a rule, an action keeps the default
// its effect gives it (agent-tool-traits.ts).

const call = (toolName: string, input: Record<string, string> = {}) => ({
  toolName,
  input,
});

describe("agent tool approval", () => {
  it("an action without a rule asks exactly when its effect needs approval", () => {
    for (const action of agentRuleActions) {
      assert.strictEqual(
        agentActionRuleActions[action].default === "ask",
        agentToolNeedsApproval(action),
        action
      );
      assert.strictEqual(
        agentToolApproval(call(action), {}),
        agentToolNeedsApproval(action) ? "user-approval" : undefined,
        action
      );
    }
  });

  it("allow runs an action that asks by default without asking", () => {
    assert.isUndefined(
      agentToolApproval(call("deleteTrackingTasks"), {
        deleteTrackingTasks: "allow",
      })
    );
  });

  it("ask makes an action that runs by default ask first", () => {
    assert.strictEqual(
      agentToolApproval(call("createTrackingTask"), {
        createTrackingTask: "ask",
      }),
      "user-approval"
    );
  });

  it("never refuses the action, with a reason that names it", () => {
    const status = agentToolApproval(call("createTrackingTask"), {
      createTrackingTask: "never",
    });

    assert.deepInclude(status, { type: "denied" });
    assert.include(JSON.stringify(status), "AGENT_ACTION_NEVER");
    assert.include(JSON.stringify(status), "createTrackingTask");
  });

  it("an email in the user's name still asks under an allow rule", () => {
    assert.strictEqual(
      agentToolApproval(call("sendEmail"), {
        sendEmail: "allow",
      }),
      "user-approval"
    );
  });

  it("a tool no rule covers keeps its effect's default", () => {
    assert.isUndefined(agentToolApproval(call("searchWeb"), {}));
    assert.strictEqual(
      agentToolApproval(call("aToolRemovedLongAgo"), {}),
      "user-approval"
    );
  });

  it("only setting a rule to allow asks the user first", () => {
    assert.strictEqual(
      agentToolApproval(
        call("setAgentActionRule", {
          action: "deleteTrackingTasks",
          rule: "allow",
        }),
        {}
      ),
      "user-approval"
    );
    assert.isUndefined(
      agentToolApproval(
        call("setAgentActionRule", {
          action: "createTrackingTask",
          rule: "ask",
        }),
        {}
      )
    );
    assert.isUndefined(
      agentToolApproval(
        call("setAgentActionRule", {
          action: "deleteTrackingTasks",
          rule: "never",
        }),
        {}
      )
    );
  });
});

const decodeDenial = Schema.decodeUnknownOption(
  Schema.Struct({ type: Schema.Literal("denied"), reason: Schema.String })
);

// A denial's reason, or null when the call was not denied.
const deniedReason = (status: ReturnType<typeof agentChatToolApproval>) =>
  Option.match(decodeDenial(status), {
    onNone: () => null,
    onSome: ({ reason }) => reason,
  });

// KeepInTax (Phase 3.1, A16, A17, plan §2.7 item 4): a tool kept only for
// stored conversations is refused if the model calls it anyway, and a
// pressed follow-up runs reads but writes nothing.
describe("agent tool approval in KeepInTax's chat", () => {
  it("a tool that is not offered is refused, whatever the user's rules", () => {
    for (const toolName of [
      "searchWeb",
      "sendEmail",
      "createTrackingTask",
      "suggestTrackingTasks",
      "loadAgentSkill",
    ]) {
      const reason = deniedReason(
        agentChatToolApproval(call(toolName), {
          createTrackingTask: "allow",
          sendEmail: "allow",
        })
      );

      assert.match(reason ?? "", /^AGENT_TOOL_NOT_AVAILABLE:/u, toolName);
    }
  });

  it("a pressed follow-up writes nothing but still reads", () => {
    for (const toolName of [
      "saveAgentMemory",
      "updateAgentMemory",
      "forgetAgentMemories",
      "updateUserSettings",
      "setAgentActionRule",
    ]) {
      assert.match(
        deniedReason(agentChatToolApproval(call(toolName), {}, "follow-up")) ??
          "",
        /^AGENT_FOLLOW_UP_NO_WRITE:/u,
        toolName
      );
    }

    for (const toolName of [
      "queryExpenses",
      "getProfitAndLoss",
      "askUserQuestion",
    ]) {
      assert.isUndefined(
        agentChatToolApproval(call(toolName), {}, "follow-up")
      );
    }
  });

  it("a typed message or a question's answer may write as before", () => {
    for (const origin of ["typed", "question-answer", "approval"] as const) {
      assert.isUndefined(
        agentChatToolApproval(call("saveAgentMemory"), {}, origin)
      );
    }
  });
});
