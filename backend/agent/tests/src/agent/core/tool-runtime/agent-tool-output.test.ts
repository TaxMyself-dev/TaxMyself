import { assert, it, describe } from "@effect/vitest";
import { Schema } from "effect";

import { agentToolModelOutput } from "../../../../../src/agent/core/tool-runtime/agent-tool-output";
import { readCutToolResultItems } from "../../../../../src/agent/tools/conversation/tool-result-items-tool";

// A cut page as the model reads it: its list, the other fields a test checks,
// and the cut note.
const decodeCutRecords = Schema.decodeUnknownSync(
  Schema.Struct({
    hasMore: Schema.Boolean,
    records: Schema.Array(Schema.Unknown),
    cut: Schema.String,
  })
);

const decodeCutResults = Schema.decodeUnknownSync(
  Schema.Struct({
    results: Schema.Array(Schema.Struct({ id: Schema.String })),
    cut: Schema.optional(Schema.String),
  })
);

const decodeCutItems = Schema.decodeUnknownSync(
  Schema.Struct({ items: Schema.Array(Schema.Unknown), cut: Schema.String })
);

// The next part's place, as the cut note gives it to the model.
const cutNoteNext = (cut: string) => {
  const next = /resultId "(?<resultId>[^"]+)", from (?<from>\d+)/u.exec(cut);

  return next?.groups
    ? { resultId: next.groups.resultId ?? "", from: Number(next.groups.from) }
    : null;
};

describe("agent tool output", () => {
  it("a small result reaches the model whole, as JSON", () => {
    assert.deepStrictEqual(agentToolModelOutput({ output: [{ id: 1 }] }), {
      type: "json",
      value: [{ id: 1 }],
    });
  });

  it("a large result with no list to shorten is cut as text, with a note to ask for less", () => {
    const output = { document: "שורה מתוך מסמך ארוך. ".repeat(2000) };
    const result = agentToolModelOutput({ output });
    assert(result.type === "text");
    assert.ok(result.value.length < 20_200);
    assert.match(result.value, /Ask for less/u);
  });

  it("a long page loses items from its end, keeping its other fields and valid JSON", () => {
    // A full page of records with long texts, as a list tool answers it.
    const records = Array.from({ length: 30 }, (_, index) => ({
      id: crypto.randomUUID(),
      title: "Quarterly report review",
      reason: "Mentions the Q3 numbers",
      url: `https://example.com/records/${index}`,
      text: "A long record body. ".repeat(60),
    }));

    const result = agentToolModelOutput({
      output: { hasMore: true, records },
    });

    assert.strictEqual(result.type, "json");
    assert.ok(JSON.stringify(result.value).length <= 20_000);
    const value = decodeCutRecords(result.value);
    assert.strictEqual(value.hasMore, true);
    assert.ok(value.records.length > 0);
    assert.ok(value.records.length < 30);
    // The kept items are whole and in order.
    assert.deepStrictEqual(value.records[0], records[0]);
    assert.match(
      value.cut,
      new RegExp(`records shows ${value.records.length} of 30`, "u")
    );
  });

  it("a cut list can be read to its end with readToolResultItems, in order and without loss", () => {
    // A wide search across several sources, as the model reads it.
    const results = Array.from({ length: 300 }, (_, index) => ({
      id: `result-${index}`,
      snippet: "A result with a long snippet. ".repeat(10),
      url: `https://example.com/results/result-${index}`,
    }));

    const first = agentToolModelOutput({
      output: { sources: [{ source: "web", found: 300 }], results },
      toolCallId: "call_search",
    });

    assert.strictEqual(first.type, "json");
    const firstPart = decodeCutResults(first.value);
    // Step: the model follows each cut note to the next part until none is left.
    const read: { id: string }[] = [...firstPart.results];
    let next = firstPart.cut === undefined ? null : cutNoteNext(firstPart.cut);

    let part = 1;

    while (next !== null) {
      const shown = agentToolModelOutput({
        output: readCutToolResultItems(next.resultId, next.from),
        toolCallId: `call_more_${part}`,
      });

      assert.strictEqual(shown.type, "json");
      assert.ok(JSON.stringify(shown.value).length <= 20_000);
      const shownPart = decodeCutResults(shown.value);
      read.push(...shownPart.results);
      next = shownPart.cut === undefined ? null : cutNoteNext(shownPart.cut);
      part += 1;
    }

    assert.deepStrictEqual(
      read.map((result) => result.id),
      results.map((result) => result.id)
    );
  });

  it("a result no longer kept says to search again", () => {
    assert.throws(() => {
      readCutToolResultItems("call_unknown", 0);
    }, /TOOL_RESULT_NOT_KEPT/u);
  });

  it("a result that is itself a long list is cut as its items, readable to the end", () => {
    // Many tasks, as listTrackingTasks answers.
    const tasks = Array.from({ length: 200 }, (_, index) => ({
      id: String(100_000_000_000 + index),
      title: `A task with a fairly long title, number ${index}`,
      url: `https://example.com/tasks/${100_000_000_000 + index}`,
    }));

    const result = agentToolModelOutput({
      output: tasks,
      toolCallId: "call_tasks",
    });

    assert.strictEqual(result.type, "json");
    const page = decodeCutItems(result.value);
    assert.match(page.cut, /items shows \d+ of 200/u);

    const rest = readCutToolResultItems("call_tasks", page.items.length);

    assert.strictEqual(
      page.items.length + (Array.isArray(rest.items) ? rest.items.length : 0),
      tasks.length
    );
  });
});
