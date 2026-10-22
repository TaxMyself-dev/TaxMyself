import { Schema } from "effect";

/**
 * A UUID a tool takes (a task's, a memory's id), as the
 * model sees it: `format: "uuid"` only. Effect's isUUID also sends its
 * 240-character pattern, once per field, in the tools every request carries
 * (agent-prompt-snapshots.test.ts); decoding the input still checks it.
 */
export const agentToolUuid = Schema.String.check(
  Schema.isUUID(undefined, { toJsonSchema: () => ({ format: "uuid" }) })
);
