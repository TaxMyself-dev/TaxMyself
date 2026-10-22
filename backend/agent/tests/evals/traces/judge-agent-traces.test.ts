import { assert, it, describe } from "@effect/vitest";

import {
  agentTraceFailedTool,
  codeAgentTraceVerdicts,
} from "./judge-agent-traces";
import type { AgentTrace } from "./judge-agent-traces";

// The production judge code decides: the same read made twice with the
// same input in one answer.

const trace = (answer: string, tools: AgentTrace["tools"]): AgentTrace => ({
  traceId: "t1",
  userMessage: "Find accountants in Chicago",
  answer,
  tools,
});

const searchCall = (query: string) => ({
  name: "searchWeb",
  input: JSON.stringify({ query }),
  failed: false,
  output: "{}",
});

describe("judge agent traces", () => {
  it("flags a read repeated with the same input, and not two different reads", () => {
    const twice = codeAgentTraceVerdicts(
      trace("I found two firms.", [
        searchCall("accountants Chicago"),
        searchCall("accountants Chicago"),
      ])
    );

    assert.isTrue(twice.repeated_read?.flagged);
    assert.include(twice.repeated_read?.reason ?? "", "accountants Chicago");

    const once = codeAgentTraceVerdicts(
      trace("I found two firms.", [
        searchCall("accountants Chicago"),
        searchCall("bookkeepers Chicago"),
      ])
    );

    assert.isFalse(once.repeated_read?.flagged);
  });

  // A failed tool's span has level ERROR and its error as the text; a result
  // that only mentions a code (a loaded playbook) did not fail.
  it("finds the tool that failed with a code, not one that mentions a code", () => {
    const failedRead = {
      name: "searchWeb",
      input: "{}",
      failed: true,
      output: "WEB_SEARCH_UNAVAILABLE: the search provider did not answer",
    };

    const playbook = {
      name: "loadAgentSkill",
      input: "{}",
      failed: false,
      output: '{"content":"on WEB_SEARCH_UNAVAILABLE: say what failed"}',
    };

    assert.strictEqual(
      agentTraceFailedTool(trace("", [playbook, failedRead])),
      failedRead
    );
    assert.isUndefined(agentTraceFailedTool(trace("", [playbook])));
  });
});
