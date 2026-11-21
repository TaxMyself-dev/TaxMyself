import { Schema } from "effect";
import type { SchemaAST } from "effect";

/**
 * An Effect Schema as a Standard Schema, for libraries that validate with one:
 * TanStack Start's createServerFn().validator() and the AI SDK's tool
 * inputSchema. It also carries the JSON Schema the AI SDK sends the model, so
 * field descriptions go in `.annotate({ description })`. Strict input (the
 * old z.strictObject, rejecting unknown keys) is a decode option in Effect:
 * pass `{ onExcessProperty: "error" }`. Effect's toStandardSchemaV1 stores
 * the validator on the schema object it is given, so each call wraps a fresh
 * copy (annotate) and one caller's options never leak into another's.
 *
 * @param schema - The Effect Schema.
 * @param parseOptions - Decoding options, such as rejecting unknown keys.
 * @returns The schema as a Standard Schema with its JSON Schema.
 */
export const toStandardSchema = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  parseOptions?: SchemaAST.ParseOptions
) =>
  Schema.toStandardJSONSchemaV1(
    Schema.toStandardSchemaV1(schema.annotate({}), { parseOptions })
  );
