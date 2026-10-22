import { DateTime, Effect, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import type { Database } from "@/lib/supabase/supabase-database";
import {
  trackingTaskChangedError,
  trackingTaskScanRunSchema,
  trackingTaskSchema,
} from "@/lib/tasks/tracking-task-schema";
import type {
  TrackingTask,
  TrackingTaskPriority,
  TrackingTaskStatus,
} from "@/lib/tasks/tracking-task-schema";
import { recordSignedInProductEvent } from "@/server/integrations/posthog-product-events.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import {
  decodeSupabaseValue,
  runSupabaseQuery,
} from "@/server/runtime/supabase-query";

import { taskSourcesSchema } from "../../../backend/monitor/sources/task-source";
import { isNonEmptyText } from "../../../backend/shared/text/non-empty-text";

// The user's tracking tasks in tracking_tasks, through the user's own client
// (RLS keeps every operation to their rows). The tasks page's server
// functions and the agent's task tools both use these.

type TrackingTaskRow = Database["public"]["Tables"]["tracking_tasks"]["Row"];

type TrackingTaskInsert =
  Database["public"]["Tables"]["tracking_tasks"]["Insert"];

const decodeTrackingTask = decodeSupabaseValue(
  "TRACKING_TASKS_READ_FAILED",
  trackingTaskSchema
);

const decodeTrackingTaskScanRun = decodeSupabaseValue(
  "TASK_SCAN_RUNS_READ_FAILED",
  trackingTaskScanRunSchema
);

const readTrackingTaskRow = (row: TrackingTaskRow) =>
  decodeTrackingTask({
    id: row.id,
    sentence: row.sentence,
    details: row.details,
    location: row.location,
    budget: row.budget,
    sources: row.sources,
    scanFrequency: row.scan_frequency,
    alerts: row.alerts,
    status: row.status,
    priority: row.priority,
    labels: row.labels,
    createdAt: row.created_at,
    lastScannedAt: row.last_scanned_at,
    lastScanError: row.last_scan_error,
    version: row.version,
  });

// The columns the user edits; the scan columns belong to the monitor, and
// the version to the database. updatedAt is the edit's time.
const trackingTaskEditColumns = (task: TrackingTask, updatedAt: string) => ({
  sentence: task.sentence,
  details: task.details,
  location: task.location,
  budget: task.budget,
  sources: Schema.encodeSync(taskSourcesSchema)(task.sources),
  scan_frequency: task.scanFrequency,
  alerts: task.alerts,
  status: task.status,
  priority: task.priority,
  labels: [...task.labels],
  updated_at: updatedAt,
});

const trackingTaskColumns = (
  task: TrackingTask,
  position: number,
  updatedAt: string
): TrackingTaskInsert => ({
  ...trackingTaskEditColumns(task, updatedAt),
  id: task.id,
  position,
  created_at: task.createdAt,
});

// The edit was made from a version the task no longer has. Its message,
// `TRACKING_TASK_CHANGED: …`, is what the tasks page matches on.
class TrackingTaskChangedError extends Schema.TaggedError<
  TrackingTaskChangedError,
  { readonly brand: unique symbol }
>()("TrackingTaskChangedError", {
  message: Schema.String.pipe(
    Schema.withConstructorDefault(
      Effect.succeed(
        `${trackingTaskChangedError}: the task changed since it was read`
      )
    )
  ),
}) {}

/**
 * The user's tasks in the board's manual order.
 */
export const readStoredTrackingTasks = Effect.fn("readStoredTrackingTasks")(
  function* readStoredTrackingTasks(supabase: UserSupabaseClient) {
    const { data: rows } = yield* runSupabaseQuery(
      "TRACKING_TASKS_READ_FAILED",
      () =>
        supabase
          .from("tracking_tasks")
          .select("*")
          .order("position")
          .order("created_at")
    );

    return yield* effectForEach(rows, (row) => readTrackingTaskRow(row));
  }
);

/**
 * One task, or null when the user has no task with this id.
 */
export const readStoredTrackingTask = Effect.fn("readStoredTrackingTask")(
  function* readStoredTrackingTask(
    supabase: UserSupabaseClient,
    taskId: string
  ) {
    const { data: row } = yield* runSupabaseQuery(
      "TRACKING_TASKS_READ_FAILED",
      () =>
        supabase
          .from("tracking_tasks")
          .select("*")
          .eq("id", taskId)
          .maybeSingle()
    );

    return row ? yield* readTrackingTaskRow(row) : null;
  }
);

// What a task's product events tell about it: its shape, never its words.
const trackingTaskEventProperties = (task: TrackingTask) => ({
  status: task.status,
  scan_frequency: task.scanFrequency,
  sources: task.sources.length,
  source_kinds: [...new Set(task.sources.map(({ kind }) => kind))].join(","),
  alerts: task.alerts,
});

/**
 * Stores a new task at its place on the board.
 *
 * @param supabase - The user's Supabase client.
 * @param task - The task.
 * @param position - Its place in its column.
 */
export const insertStoredTrackingTask = Effect.fn("insertStoredTrackingTask")(
  function* insertStoredTrackingTask(
    supabase: UserSupabaseClient,
    task: TrackingTask,
    position: number
  ) {
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    yield* runSupabaseQuery("TRACKING_TASK_WRITE_FAILED", () =>
      supabase
        .from("tracking_tasks")
        .insert(trackingTaskColumns(task, position, updatedAt))
    );
    yield* recordSignedInProductEvent(
      supabase,
      "tracking_task_created",
      trackingTaskEventProperties(task)
    );
  }
);

/**
 * Saves an edit only over the version it was made from (optimistic
 * concurrency), so an edit never silently undoes a change made since in
 * another tab, on the board, or by a bulk action.
 */
export const updateStoredTrackingTask = Effect.fn("updateStoredTrackingTask")(
  function* updateStoredTrackingTask(
    supabase: UserSupabaseClient,
    task: TrackingTask
  ) {
    const updatedAt = DateTime.formatIso(yield* DateTime.now);

    const { data: rows } = yield* runSupabaseQuery(
      "TRACKING_TASK_WRITE_FAILED",
      () =>
        supabase
          .from("tracking_tasks")
          .update({
            ...trackingTaskEditColumns(task, updatedAt),
            version: task.version + 1,
          })
          .eq("id", task.id)
          .eq("version", task.version)
          .select("id")
    );

    if (rows.length === 0) {
      return yield* new TrackingTaskChangedError({});
    }

    return yield* recordSignedInProductEvent(
      supabase,
      "tracking_task_updated",
      trackingTaskEventProperties(task)
    );
  }
);

/**
 * Deletes tasks and counts how many went.
 *
 * @param supabase - The user's Supabase client.
 * @param taskIds - The tasks' ids.
 */
export const deleteStoredTrackingTasks = Effect.fn("deleteStoredTrackingTasks")(
  function* deleteStoredTrackingTasks(
    supabase: UserSupabaseClient,
    taskIds: readonly string[]
  ) {
    const { data } = yield* runSupabaseQuery(
      "TRACKING_TASK_DELETE_FAILED",
      () =>
        supabase.from("tracking_tasks").delete().in("id", taskIds).select("id")
    );

    yield* recordSignedInProductEvent(supabase, "tracking_tasks_deleted", {
      tasks: data.length,
    });

    return data.length;
  }
);

/**
 * Changes the status or priority of tasks and bumps their versions.
 */
export const changeStoredTrackingTasks = Effect.fn("changeStoredTrackingTasks")(
  function* changeStoredTrackingTasks(
    supabase: UserSupabaseClient,
    taskIds: readonly string[],
    change: { status?: TrackingTaskStatus; priority?: TrackingTaskPriority }
  ) {
    yield* runSupabaseQuery("TRACKING_TASK_WRITE_FAILED", () =>
      supabase.rpc("change_tracking_tasks", {
        task_ids: [...taskIds],
        new_status: change.status ?? null,
        new_priority: change.priority ?? null,
      })
    );
    yield* recordSignedInProductEvent(supabase, "tracking_task_updated", {
      tasks: taskIds.length,
      status: change.status ?? null,
      priority: change.priority ?? null,
    });
  }
);

/**
 * Asks the monitor to scan an active task on its next minute instead of at
 * its scan frequency: claim_due_tracking_tasks treats a passed scan_retry_at
 * as due, and a good scan clears it. Null when the task is not active.
 */
export const requestStoredTrackingTaskScan = Effect.fn(
  "requestStoredTrackingTaskScan"
)(function* requestStoredTrackingTaskScan(
  supabase: UserSupabaseClient,
  taskId: string
) {
  const scanRetryAt = DateTime.formatIso(yield* DateTime.now);

  const { data } = yield* runSupabaseQuery("TRACKING_TASK_WRITE_FAILED", () =>
    supabase
      .from("tracking_tasks")
      .update({ scan_retry_at: scanRetryAt })
      .eq("id", taskId)
      .eq("status", "active")
      .select("id")
  );

  if (data.length > 0) {
    yield* recordSignedInProductEvent(supabase, "tracking_task_scan_requested");
  }

  return data.length > 0;
});

/**
 * The latest scans by the monitor (task_scan_runs), newest first: one task's,
 * or all the user's tasks' when taskId is null.
 */
export const readStoredTaskScanRuns = Effect.fn("readStoredTaskScanRuns")(
  function* readStoredTaskScanRuns(
    supabase: UserSupabaseClient,
    { taskId, limit }: { taskId: string | null; limit: number }
  ) {
    let query = supabase
      .from("task_scan_runs")
      .select(
        "id, task_id, status, sources_scanned, items_scored, matches, error, started_at, finished_at"
      )
      .order("started_at", { ascending: false })
      .limit(limit);

    if (isNonEmptyText(taskId)) {
      query = query.eq("task_id", taskId);
    }

    const { data: rows } = yield* runSupabaseQuery(
      "TASK_SCAN_RUNS_READ_FAILED",
      () => query
    );

    return yield* effectForEach(rows, (row) =>
      decodeTrackingTaskScanRun({
        id: row.id,
        status: row.status,
        sourcesScanned: row.sources_scanned,
        itemsScored: row.items_scored,
        matches: row.matches,
        error: row.error,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      }).pipe(Effect.map((run) => ({ taskId: row.task_id, ...run })))
    );
  }
);
