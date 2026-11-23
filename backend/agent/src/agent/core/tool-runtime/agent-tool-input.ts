import { Schema } from "effect";

/**
 * An optional tool input: models send null for a field they leave out as
 * often as they omit it, and both mean "not set".
 *
 * @param schema - The field's schema.
 * @returns The field's schema, accepting null or a missing value.
 */
export const agentOptional = <S extends Schema.Top>(schema: S) =>
  Schema.optional(Schema.NullOr(schema));
