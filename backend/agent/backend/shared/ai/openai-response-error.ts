import { Schema } from "effect";

/**
 * Why a Responses API request failed (OpenAiResponses in
 * backend/shared/ai/openai-response.ts):
 * - missing_key: OPENAI_API_KEY is not set; nothing was sent;
 * - unavailable: the request or its body failed, or the timeout passed;
 * - rejected: OpenAI answered with a non-2xx status;
 * - malformed: the body is not the expected reply JSON (an incomplete answer).
 */
export class OpenAiResponseError extends Schema.TaggedError<
  OpenAiResponseError,
  { readonly brand: unique symbol }
>()("OpenAiResponseError", {
  failure: Schema.Literals([
    "missing_key",
    "unavailable",
    "rejected",
    "malformed",
  ]),
}) {
  /**
   * The error as `OPENAI_RESPONSE_FAILED: <failure>`, what logs and tests match
   * on.
   *
   * @returns The failure, as one line.
   */
  override get message() {
    return `OPENAI_RESPONSE_FAILED: ${this.failure}`;
  }
}
