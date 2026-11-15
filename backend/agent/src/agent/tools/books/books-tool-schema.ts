import type { Effect } from "effect";
import { Schema } from "effect";

import { appRuntime } from "@/server/runtime/app-runtime.server";

import { trimmedLengthString } from "../../../../backend/shared/schema/trimmed-length-string";

// The input pieces the books and reports tools share, and the one way they
// run: the request's KeepInTaxBooks read, as the data owner, changing
// nothing (queryExpenses keeps its own file, as it was).

/** One of the user's businesses, by number. */
export const businessNumberInput = Schema.optionalKey(
  Schema.String.check(Schema.isPattern(/^\d{5,12}$/u)).annotate({
    description:
      "One of the user's businesses, its number from <businesses> in the user context: the one the user named or chose. Left out: the business this conversation is about, else their only one, else BUSINESS_REQUIRED",
  })
);

const isoDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
);

/** The range's first day. */
export const fromInput = isoDate.annotate({
  description:
    'The range\'s first day, YYYY-MM-DD. "This year" starts on January 1 of the current year',
});

/** The range's last day. */
export const toInput = isoDate.annotate({
  description: "The range's last day, YYYY-MM-DD, inclusive",
});

/**
 * Free text the model fills from the user's words (trimmed-length-string.ts:
 * the JSON Schema the model reads describes the input side).
 *
 * @param description - What the text is.
 * @returns The schema.
 */
export const textInput = (description: string) =>
  Schema.optionalKey(
    trimmedLengthString(1, 100).pipe(Schema.annotateEncoded({ description }))
  );

/**
 * Whether to return the rows themselves.
 *
 * @param description - What the rows are.
 * @returns The schema.
 */
export const includeRowsInput = (description: string) =>
  Schema.optionalKey(Schema.Boolean.annotate({ description }));

/**
 * Runs one books read on the app's runtime, stopped with the tool call.
 *
 * @param read - The read.
 * @param signal - The tool call's abort signal.
 * @returns The read's answer.
 */
export const runBooksRead = async <Answer>(
  read: Effect.Effect<Answer, Error>,
  signal: AbortSignal | undefined
) => await appRuntime.runPromise(read, { signal });
