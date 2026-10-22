import { Effect, Schema } from "effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import {
  changeStoredTrackingTasks,
  deleteStoredTrackingTasks,
  insertStoredTrackingTask,
  readStoredTrackingTasks,
  readStoredTaskScanRuns,
  updateStoredTrackingTask,
} from "@/server/tasks/tracking-task-storage.server";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";
import {
  trackingTaskPriorities,
  trackingTaskSchema,
  trackingTaskStatuses,
} from "./tracking-task-schema";
import type { TrackingTask } from "./tracking-task-schema";

const taskIdsInput = Schema.Array(Schema.String.check(Schema.isUUID())).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500)
);

/**
 * The user's tasks in the board's manual order.
 */
export const readTrackingTasks = createServerFn({ method: "GET" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({ data }): Promise<TrackingTask[]> =>
      await runAppRequest(
        Effect.gen(function* readTrackingTasksHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredTrackingTasks(supabase);
        })
      )
  );

/**
 * Creates a new task at the given place on the board.
 */
export const createTrackingTask = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        task: trackingTaskSchema,
        position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* createTrackingTaskHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* insertStoredTrackingTask(supabase, data.task, data.position);
      })
    );
  });

/**
 * Saves an edit over the version it was made from (see
 * updateStoredTrackingTask).
 */
export const updateTrackingTask = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({ ...userIdServerInput.fields, task: trackingTaskSchema })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* updateTrackingTaskHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* updateStoredTrackingTask(supabase, data.task);
      })
    );
  });

/**
 * Deletes tasks, on the server.
 *
 * @param context - data: the signed-in user's id and the tasks' ids.
 * @returns A promise that settles once they are deleted.
 */
export const deleteTrackingTasks = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({ ...userIdServerInput.fields, taskIds: taskIdsInput })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* deleteTrackingTasksHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* deleteStoredTrackingTasks(supabase, data.taskIds);
      })
    );
  });

/**
 * Changes tasks' status or priority, on the server.
 *
 * @param context - data: the signed-in user's id, the tasks' ids and the
 *   change.
 * @returns A promise that settles once it is saved.
 */
export const changeTrackingTasks = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        taskIds: taskIdsInput,
        change: Schema.Struct({
          status: Schema.optional(Schema.Literals(trackingTaskStatuses)),
          priority: Schema.optional(Schema.Literals(trackingTaskPriorities)),
        }).check(
          Schema.makeFilter(
            (change) =>
              change.status !== undefined || change.priority !== undefined
          )
        ),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* changeTrackingTasksHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* changeStoredTrackingTasks(supabase, data.taskIds, data.change);
      })
    );
  });

/**
 * The board's manual order and each task's column, saved in one statement.
 */
export const saveTrackingTaskOrder = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        arranged: Schema.Array(
          Schema.Struct({
            id: Schema.String.check(Schema.isUUID()),
            status: Schema.Literals(trackingTaskStatuses),
          })
        ).check(Schema.isMaxLength(500)),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* saveTrackingTaskOrderHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* runSupabaseQuery("TRACKING_TASK_ORDER_WRITE_FAILED", () =>
          supabase.rpc("arrange_tracking_tasks", { arranged: data.arranged })
        );
      })
    );
  });

/**
 * A task's latest scans (task_scan_runs), newest first.
 */
export const readTrackingTaskScanRuns = createServerFn({ method: "GET" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        taskId: Schema.String.check(Schema.isUUID()),
      })
    )
  )
  .handler(
    async ({ data }) =>
      await runAppRequest(
        Effect.gen(function* readTrackingTaskScanRunsHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredTaskScanRuns(supabase, {
            taskId: data.taskId,
            limit: 5,
          });
        })
      )
  );
