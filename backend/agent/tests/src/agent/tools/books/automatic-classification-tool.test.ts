import { describe, expect, it } from "vitest";

import { isAgentToolOffered } from "../../../../../src/agent/core/agent/agent-capabilities";
import { agentChatToolApproval } from "../../../../../src/agent/core/tool-runtime/agent-tool-approval";
import {
  agentToolChangesData,
  agentToolLeavesNoTrace,
  agentToolRunsAlone,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-traits";

describe("automatic classification scheduling tool policy", () => {
  it("is an offered serialized write, never a harmless retryable read", () => {
    expect(isAgentToolOffered("startAutomaticClassification")).toBeTruthy();
    expect(agentToolChangesData("startAutomaticClassification")).toBeTruthy();
    expect(agentToolRunsAlone("startAutomaticClassification")).toBeTruthy();
    expect(agentToolLeavesNoTrace("startAutomaticClassification")).toBeFalsy();
  });

  it("a suggested follow-up cannot schedule classification", () => {
    expect(
      agentChatToolApproval(
        { toolName: "startAutomaticClassification", input: {} },
        {},
        "follow-up"
      )
    ).toMatchObject({ type: "denied" });
  });
});
