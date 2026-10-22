import { Schema } from "effect";

// Why a request to TypeSafe's Jev failed (backend/shared/ai/typesafe-jev-client.ts).
const jevFailureSchema = Schema.Literals([
  "missing_key",
  "timeout",
  "rejected",
  "invalid",
]);

/**
 * Why a Jev request failed, one of jevFailureSchema's values.
 */
export type JevFailure = typeof jevFailureSchema.Type;

/**
 * Its message, `JEV_REQUEST_FAILED: <failure>: <detail>`, is what logs and
 * tests match on.
 */
export class JevRequestError extends Schema.TaggedError<
  JevRequestError,
  { readonly brand: unique symbol }
>()("JevRequestError", {
  failure: jevFailureSchema,
  detail: Schema.String,
  // The HTTP status Jev answered with, for a rejected request.
  status: Schema.optional(Schema.Finite),
}) {
  /**
   * The error as `JEV_REQUEST_FAILED: <failure>: <detail>`, what logs and tests
   * match on.
   *
   * @returns The failure and detail, as one line.
   */
  override get message() {
    return `JEV_REQUEST_FAILED: ${this.failure}: ${this.detail}`;
  }
}
