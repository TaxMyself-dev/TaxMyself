import { Predicate } from "effect";

import type { AgentSqlParameter, AgentSqlValue } from "./mysql-agent-database";
import { PostgrestGatewayError } from "./mysql-agent-errors";
import type { AgentColumnKind } from "./mysql-agent-tables";

// Values between the JSON PostgREST speaks and MySQL's columns: each kind
// converts one way for parameters (a filter's text, a row's JSON value) and
// the other way for rows read back. The pool reads DATETIME as text
// (dateStrings) in UTC (mysql-agent-database.ts), so no Date ever shifts a
// time by the server's zone.

// "2026-10-22T13:30:51.235123+00:00", "2026-10-22T13:30:51Z",
// "2026-10-22 13:30:51.235": a date, a time, its fraction, its zone.
const timestampDate = /^\d{4}-\d{2}-\d{2}$/u;
const timestampTime = /^\d{2}:\d{2}(?::\d{2})?$/u;
const timestampZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/u;
const utcZone = /^(?:Z|[+-]00(?::?00)?)$/u;

// A time's text split into its date, time, fraction and zone, or null when
// it is not an ISO time.
const timestampParts = (value: string) => {
  const trimmed = value.trim();
  const zone = timestampZone.exec(trimmed)?.[0] ?? "";
  const withoutZone = trimmed.slice(0, trimmed.length - zone.length);
  const [date = "", clock = ""] = withoutZone.split(/[T ]/u);
  const [time = "", fraction = ""] = clock.split(".");

  if (
    !timestampDate.test(date) ||
    !timestampTime.test(time) ||
    !/^\d{0,9}$/u.test(fraction)
  ) {
    return null;
  }

  return { date, time, fraction, zone };
};

/**
 * A timestamp from PostgREST's side (an ISO time, as the template's code and
 * Postgres write them) as MySQL's DATETIME(6) text in UTC. A time with an
 * offset other than UTC is converted (to milliseconds, as JavaScript reads
 * it); a UTC one keeps its microseconds, so a value read back compares equal.
 *
 * @param value - The ISO time.
 * @returns The DATETIME(6) text, or null when it is not a time.
 */
export const mysqlTimestamp = (value: string): string | null => {
  const parts = timestampParts(value);

  if (parts === null) {
    return null;
  }

  if (parts.zone !== "" && !utcZone.test(parts.zone)) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toISOString().replace("T", " ").replace("Z", "");
  }

  const seconds = parts.time.length === 5 ? `${parts.time}:00` : parts.time;
  const micros = parts.fraction.padEnd(6, "0").slice(0, 6);

  return `${parts.date} ${seconds}.${micros}`;
};

/**
 * A DATETIME(6) read back, as Postgres writes a timestamptz in JSON.
 *
 * @param value - The column's text, "2026-10-22 13:30:51.235123".
 * @returns "2026-10-22T13:30:51.235123+00:00".
 */
export const postgresTimestamp = (value: string) => {
  const [date, time = "00:00:00"] = value.split(" ");
  const [whole, fraction = ""] = time.split(".");
  const micros = fraction.padEnd(6, "0").slice(0, 6);

  return `${date}T${whole}.${micros}+00:00`;
};

// A JSON value's text, as a text column stores it.
const jsonText = (value: AgentSqlValue) =>
  Predicate.isString(value) ? value : JSON.stringify(value);

const uuidPattern =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

// Text Postgres would refuse for a column's type (22P02).
const invalidInput = (type: string, text: string) =>
  new PostgrestGatewayError(
    400,
    "22P02",
    `invalid input syntax for type ${type}: "${text}"`
  );

// A uuid as Postgres keeps one: checked, and lowercase, so ids compare as
// they would there.
const uuidText = (text: string) => {
  if (!uuidPattern.test(text)) {
    throw invalidInput("uuid", text);
  }

  return text.toLowerCase();
};

const trueTexts = new Set(["true", "t", "1", "yes", "on"]);
const falseTexts = new Set(["false", "f", "0", "no", "off"]);

// A boolean as Postgres reads one, or its refusal.
const booleanFlag = (value: AgentSqlValue) => {
  const text = jsonText(value).toLowerCase();

  if (value === true || trueTexts.has(text)) {
    return 1;
  }

  if (value === false || falseTexts.has(text)) {
    return 0;
  }

  throw invalidInput("boolean", text);
};

/**
 * A value from a request (a row's JSON field) as the parameter its column
 * takes: JSON columns as JSON text, booleans as 1 or 0, times as DATETIME(6)
 * text.
 *
 * @param kind - The column's kind.
 * @param value - The value as JSON.
 * @returns The parameter.
 */
export const mysqlParameter = (
  kind: AgentColumnKind,
  value: AgentSqlValue | undefined
): AgentSqlParameter => {
  if (value === null || value === undefined) {
    return null;
  }

  switch (kind) {
    case "json":
    case "array": {
      return JSON.stringify(value);
    }

    case "boolean": {
      return booleanFlag(value);
    }

    case "integer": {
      return Number(value);
    }

    case "timestamp": {
      const text = jsonText(value);

      return mysqlTimestamp(text) ?? text;
    }

    case "uuid": {
      return uuidText(jsonText(value));
    }

    case "text": {
      return jsonText(value);
    }

    default: {
      return jsonText(value);
    }
  }
};

/**
 * A filter's value (the text after `eq.`, an `in` list's item) as the
 * parameter its column takes.
 *
 * @param kind - The column's kind.
 * @param text - The value as PostgREST's URL writes it.
 * @returns The parameter.
 */
export const mysqlFilterParameter = (
  kind: AgentColumnKind,
  text: string
): AgentSqlParameter => {
  switch (kind) {
    case "boolean": {
      return booleanFlag(text);
    }

    case "integer": {
      return Number(text);
    }

    case "timestamp": {
      return mysqlTimestamp(text) ?? text;
    }

    case "uuid": {
      return uuidText(text);
    }

    case "text":
    case "json":
    case "array": {
      return text;
    }

    default: {
      return text;
    }
  }
};

/**
 * A column's value read back from MySQL as PostgREST's JSON writes it.
 *
 * @param kind - The column's kind.
 * @param value - The value mysql2 read.
 * @returns The JSON value.
 */
export const postgrestValue = (
  kind: AgentColumnKind,
  value: AgentSqlValue | undefined
): AgentSqlValue => {
  if (value === null || value === undefined) {
    return null;
  }

  switch (kind) {
    case "boolean": {
      return value === 1 || value === true || value === "1";
    }

    case "integer": {
      return Number(value);
    }

    case "timestamp": {
      return postgresTimestamp(jsonText(value));
    }

    case "json":
    case "array": {
      // mysql2 parses JSON columns; a top-level JSON string stays a string.
      return value;
    }

    case "uuid":
    case "text": {
      return value;
    }

    default: {
      return value;
    }
  }
};
