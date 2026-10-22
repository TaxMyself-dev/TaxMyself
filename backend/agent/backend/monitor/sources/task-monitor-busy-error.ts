import { Schema } from "effect";

/**
 * A shared resource a scan needs (one browser, one account's quota) is taken
 * by the user's own work: the scan stops and its task is given back
 * unscanned, to retry on the next tick.
 */
export class TaskMonitorBusyError extends Schema.TaggedError<
  TaskMonitorBusyError,
  { readonly brand: unique symbol }
>()("TaskMonitorBusyError", {}) {}
