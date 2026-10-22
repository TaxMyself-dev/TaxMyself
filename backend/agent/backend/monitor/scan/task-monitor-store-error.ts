import { Schema } from "effect";

/**
 * A failed monitor database operation. Its message,
 * `TASK_MONITOR_<OPERATION>_FAILED: <detail>`, is what logs match on; the
 * scan shows a generic retry message instead of it (task-monitor.ts).
 */
export class TaskMonitorStoreError extends Schema.TaggedError<
  TaskMonitorStoreError,
  { readonly brand: unique symbol }
>()("TaskMonitorStoreError", { code: Schema.String, detail: Schema.String }) {
  /**
   * The error as `<CODE>: <detail>`, the form the monitor's logs and the task's
   * scan error show.
   *
   * @returns The code and detail, as one line.
   */
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}
