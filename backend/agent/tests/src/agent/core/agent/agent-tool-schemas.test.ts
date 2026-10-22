import { assert, it, describe } from "@effect/vitest";
import { asSchema } from "ai";

import { appAgentTools } from "../../../../../src/agent/core/tool-runtime/app-agent-tools";

describe("agent tool schemas", () => {
  // Every request sends every tool's input schema to OpenAI, which rejects the
  // whole request when one pattern uses a regex feature its schemas lack, such
  // as Unicode classes (\p{L}): one bad tool would break every chat.
  it("no tool's input schema uses a regex feature OpenAI's tool schemas reject", async () => {
    const schemas = await Promise.all(
      Object.entries(appAgentTools).map(async ([name, tool]) => ({
        name,
        schema: JSON.stringify(await asSchema(tool.inputSchema).jsonSchema),
      }))
    );

    for (const { name, schema } of schemas) {
      assert.notMatch(schema, /\\\\p\{/u, `${name} uses a Unicode class`);
    }
  });
});
