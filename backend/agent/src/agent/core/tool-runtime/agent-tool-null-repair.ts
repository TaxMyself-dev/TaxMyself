import type { Schema } from "effect";

// The model sends null for a field it leaves empty ("location": null) where
// a tool's schema only lets it be left out, and the call is refused: every
// search with such a field sent its call twice, a model step of about 2 s
// each time (search evals, 2026-10-17). Leaving the null fields out is
// what the model meant, so a refused call goes again without them.

// JSON.parse leaves out an object's field whose reviver returns undefined;
// in a list the slot stays and is written back as null.
const skipNullField = (_key: string, value: Schema.Json) => value ?? undefined;

/**
 * A refused tool call's input without its null fields, for the agent's
 * repairToolCall; null when it has none or is not JSON, so nothing changes.
 *
 * @param input - The call's input, as the model wrote it (JSON text).
 * @returns The input without null fields as JSON text, or null.
 */
export const dropAgentToolInputNulls = (input: string) => {
  try {
    const repaired = JSON.stringify(JSON.parse(input, skipNullField));

    return repaired === JSON.stringify(JSON.parse(input)) ? null : repaired;
  } catch {
    return null;
  }
};
