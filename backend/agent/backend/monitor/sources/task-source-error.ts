import { Schema } from "effect";

/**
 * One source failed this scan (down, refused, changed): it is logged and
 * skipped, and the next scan tries it again. Its message is
 * `<CODE>: <detail>`.
 */
export class TaskSourceError extends Schema.TaggedError<
  TaskSourceError,
  { readonly brand: unique symbol }
>()("TaskSourceError", { code: Schema.String, detail: Schema.String }) {
  /**
   * The error as `<CODE>: <detail>`.
   *
   * @returns The code and detail, as one line.
   */
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}
