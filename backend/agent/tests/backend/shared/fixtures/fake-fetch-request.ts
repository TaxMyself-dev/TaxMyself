import { Predicate } from "effect";

import type { SerializableValue } from "../../../../backend/shared/schema/json-value";

/**
 * The address a fake fetch was asked for: a Request's url, or the string or
 * URL itself.
 *
 * @param input - The fetch's input.
 * @returns The address as text.
 */
export const fakeFetchUrl = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString();

/**
 * A fake fetch's request body as text. The clients under test send JSON as a
 * string or as bytes; anything else reads as empty.
 *
 * @param body - The request's body.
 * @returns The body's text.
 */
export const fakeFetchBodyText = (body: BodyInit | null | undefined) => {
  if (Predicate.isString(body)) {
    return body;
  }

  return body instanceof Uint8Array ? new TextDecoder().decode(body) : "";
};

/**
 * A JSON value as the text a fake compares or records: a string as itself,
 * anything else as its JSON (null as "null", 5 as "5"); nothing as "".
 *
 * @param value - The JSON value, if any.
 * @returns The text.
 */
export const fakeJsonText = (value: SerializableValue) =>
  Predicate.isString(value) ? value : (JSON.stringify(value) ?? "");
