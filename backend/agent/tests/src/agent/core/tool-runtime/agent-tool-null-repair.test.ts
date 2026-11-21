import { assert, describe, it } from "@effect/vitest";

import { dropAgentToolInputNulls } from "../../../../../src/agent/core/tool-runtime/agent-tool-null-repair";

// A tool call refused for a null where the field may only be left out goes
// again without it; one without nulls is not repaired.

describe("agent tool null repair", () => {
  it("drops null fields at any depth and keeps the rest as written", () => {
    const repaired = dropAgentToolInputNulls(
      JSON.stringify({
        query: "accountants in Haifa",
        maxResults: 10,
        filter: { topic: "bookkeeping", city: null, budget: null },
      })
    );

    assert.deepStrictEqual(JSON.parse(repaired ?? "null"), {
      query: "accountants in Haifa",
      maxResults: 10,
      filter: { topic: "bookkeeping" },
    });
  });

  it("a null inside a list is a value, not a field, and stays", () => {
    assert.isNull(dropAgentToolInputNulls(JSON.stringify({ ids: [null, 1] })));
  });

  it("an input without nulls, or not JSON, is not repaired", () => {
    assert.isNull(dropAgentToolInputNulls(JSON.stringify({ query: "ספה" })));
    assert.isNull(dropAgentToolInputNulls("{not json"));
  });
});
