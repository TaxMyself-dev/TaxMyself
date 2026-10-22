import { Schema } from "effect";

// A UTC ISO 8601 date-time as Date#toISOString writes it
// ("2026-01-31T12:00:00.000Z"); seconds and fractions optional, the trailing Z
// required, so an offset such as Postgres's "+00:00" is rejected.
export const IsoDateTimeString = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/u, {
    message: "Expected an ISO date-time ending in Z",
  })
);
