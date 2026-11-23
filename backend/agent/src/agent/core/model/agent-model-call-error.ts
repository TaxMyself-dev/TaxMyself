import { Schema } from "effect";

/**
 * A failed call to the agent's model outside the chat stream (a chat title).
 * Its message is the AI SDK's own.
 */
export class AgentModelCallError extends Schema.TaggedError<
  AgentModelCallError,
  { readonly brand: unique symbol }
>()("AgentModelCallError", { cause: Schema.Defect() }) {
  /**
   * The model call's own error message.
   *
   * @returns The cause's message, or the cause as text.
   */
  override get message() {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}
