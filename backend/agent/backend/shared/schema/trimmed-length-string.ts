import { Schema, SchemaTransformation } from "effect";

/**
 * A string decoded with surrounding whitespace trimmed, whose trimmed length
 * is between minLength and maxLength. The length
 * check runs on the input but measures it trimmed, so the JSON Schema an AI
 * SDK tool sends the model still carries minLength and maxLength; Schema.Trim
 * checks only its decoded side, which a tool's JSON Schema does not show.
 * Annotate the input with `.pipe(Schema.annotateEncoded({ description }))`:
 * `.annotate` on the result describes the decoded side only.
 *
 * @param minLength - The fewest characters allowed after trimming.
 * @param maxLength - The most characters allowed after trimming.
 * @returns The string schema.
 */
export const trimmedLengthString = (minLength: number, maxLength: number) =>
  Schema.String.check(
    Schema.makeFilter(
      (value: string) => {
        const { length } = value.trim();

        return length >= minLength && length <= maxLength;
      },
      {
        expected: `a string of ${minLength} to ${maxLength} characters after trimming`,
        toJsonSchema: () => ({ minLength, maxLength }),
      }
    )
  ).pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()));
