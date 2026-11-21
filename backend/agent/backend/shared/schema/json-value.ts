import { Predicate } from "effect";
import type { Schema } from "effect";

/**
 * A JSON value from an outside source, typed as JSON rather than
 * unknown; schemas narrow it to a domain type where it is consumed. Decode
 * unknown input to it with Schema.Json.
 */
export type JsonValue = Schema.Json;

/**
 * A JSON object whose values stay typed as JSON.
 */
export type JsonObject = Record<string, JsonValue>;

/**
 * Whether a JSON value is an object (not null, not an array), keeping its
 * values typed as JSON.
 *
 * @param value - The JSON value, if any.
 * @returns Whether it is a JSON object.
 */
export const isJsonObject = (
  value: JsonValue | undefined
): value is JsonObject => Predicate.isObject(value);

/**
 * Whether a JSON value is an array, keeping its items typed as JSON
 * (Array.isArray alone narrows to any[]).
 *
 * @param value - The JSON value, if any.
 * @returns Whether it is a JSON array.
 */
export const isJsonArrayValue = (
  value: JsonValue | undefined
): value is Schema.JsonArray => Array.isArray(value);

/**
 * A value as code hands it to a decoder or to JSON.stringify: JSON from a page
 * or a response, or a value the caller built; never a function or a symbol.
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | object
  | null
  | undefined;

/**
 * Whether a value can go to a decoder or to JSON.stringify as it is: anything
 * but a function, a symbol or a bigint.
 *
 * @param value - The value.
 * @returns Whether it is a SerializableValue.
 */
export const isSerializableValue = (
  value: unknown
): value is SerializableValue =>
  !(
    Predicate.isFunction(value) ||
    Predicate.isSymbol(value) ||
    Predicate.isBigInt(value)
  );
