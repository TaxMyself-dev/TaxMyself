import { assert, it, describe } from "@effect/vitest";
import { asSchema } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../../backend/shared/schema/standard-schema";
import { agentToolUuid } from "../../../../../src/agent/core/tool-runtime/agent-tool-uuid";

// The model sees a tool's UUID field as format uuid, without Effect's long
// pattern; the input is still checked against it.

describe("agent tool uuid", () => {
  it("shows the model the format only", async () => {
    const jsonSchema = await asSchema(
      toStandardSchema(Schema.Struct({ taskId: agentToolUuid }))
    ).jsonSchema;

    assert.deepInclude(jsonSchema, {
      properties: { taskId: { type: "string", format: "uuid" } },
    });
  });

  it("still rejects an id that is not a UUID", () => {
    const decode = Schema.decodeUnknownOption(agentToolUuid);

    assert.isTrue(
      decode("6f1c2a1e-1111-4a1a-8a1a-111111111111")._tag === "Some"
    );
    assert.isTrue(
      decode("6f1c2a1e-1111-4a1a-8a1a-11111111111")._tag === "None"
    );
    assert.isTrue(decode("task-1")._tag === "None");
  });
});
