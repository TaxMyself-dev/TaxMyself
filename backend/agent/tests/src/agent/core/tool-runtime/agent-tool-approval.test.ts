import { assert, describe, it } from "@effect/vitest";

import { agentToolApproval } from "../../../../../src/agent/core/tool-runtime/agent-tool-approval";
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
