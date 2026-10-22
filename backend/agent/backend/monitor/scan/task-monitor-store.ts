import { Context, Effect, Layer } from "effect";

import { SupabaseServiceDatabase } from "../../shared/supabase/supabase-service-database";
import type { TaskItem } from "../sources/task-source";
import { makeTaskMonitorQuery } from "./task-monitor-query";
import type {
  EarlierTaskMatch,
  MonitorUserPreferences,
  MonitoredTask,
  TaskOpportunityInput,
  TaskPostScore,
} from "./task-monitor-records";
import { makeTaskMonitorScanReads } from "./task-monitor-scan-reads";
import { makeTaskMonitorScanWrites } from "./task-monitor-scan-writes";
import type { TaskMonitorStoreError } from "./task-monitor-store-error";

// The task monitor's database access (TaskMonitorStore). It runs in the
// background worker with the service role (SupabaseServiceDatabase), which
// bypasses RLS, so every operation here takes the owner explicitly and
// touches only that user's rows. The service exposes monitor operations,
// never the client; the monitor's tests replace it whole.

/**
 * The task monitor's database access, run with the service role: every
 * operation takes the owner explicitly and touches only that user's rows.
 */
export class TaskMonitorStore extends Context.Service<
  TaskMonitorStore,
  {
    // Claims due tasks, at most claimLimit, for leaseSeconds; a claim another
    // worker holds is skipped (claim_due_tracking_tasks).
    readonly claimDueTasks: (
      leaseSeconds: number,
      claimLimit: number
    ) => Effect.Effect<MonitoredTask[], TaskMonitorStoreError>;
    readonly renewTaskScanClaim: (
      task: MonitoredTask,
      leaseSeconds: number
    ) => Effect.Effect<void, TaskMonitorStoreError>;
    readonly readMonitorPreferences: (
      ownerId: string
    ) => Effect.Effect<MonitorUserPreferences | null, TaskMonitorStoreError>;
    readonly readEarlierTaskMatches: (
      task: MonitoredTask,
      since: string
    ) => Effect.Effect<EarlierTaskMatch[], TaskMonitorStoreError>;
    readonly readScannedItemKeys: (
      taskId: string,
      source: string
    ) => Effect.Effect<Set<string>, TaskMonitorStoreError>;
    // One source's items, their scores and the matches, in one transaction
    // (record_task_source_scan).
    readonly recordTaskSourceScan: (
      task: MonitoredTask,
      items: readonly TaskItem[],
      scores: TaskPostScore[],
      opportunities: TaskOpportunityInput[]
    ) => Effect.Effect<void, TaskMonitorStoreError>;
    readonly finishTaskScan: (
      task: MonitoredTask,
      scanError: string | null
    ) => Effect.Effect<void, TaskMonitorStoreError>;
    readonly releaseTaskScan: (
      task: MonitoredTask
    ) => Effect.Effect<void, TaskMonitorStoreError>;
  }
>()("app/monitor/TaskMonitorStore") {
  static readonly layerNoDeps = Layer.effect(
    TaskMonitorStore,
    Effect.gen(function* makeTaskMonitorStore() {
      const database = yield* SupabaseServiceDatabase;
      const runTaskMonitorQuery = makeTaskMonitorQuery(database);

      const claimDueTasks = Effect.fn("TaskMonitorStore.claimDueTasks")(
        function* claimDueTasks(
          leaseSeconds: number,
          claimLimit: number
        ): Effect.fn.Return<MonitoredTask[], TaskMonitorStoreError> {
          return yield* runTaskMonitorQuery(
            "TASK_MONITOR_CLAIM_FAILED",
            (client) =>
              client.rpc("claim_due_tracking_tasks", {
                lease_seconds: leaseSeconds,
                claim_limit: claimLimit,
              })
          );
        }
      );

      const renewTaskScanClaim = Effect.fn(
        "TaskMonitorStore.renewTaskScanClaim"
      )(function* renewTaskScanClaim(
        task: MonitoredTask,
        leaseSeconds: number
      ) {
        yield* runTaskMonitorQuery(
          "TASK_MONITOR_CLAIM_RENEW_FAILED",
          (client) =>
            client.rpc("renew_task_scan_claim", {
              scan_run_id: task.run_id,
              lease_seconds: leaseSeconds,
            })
        );
      });

      const readMonitorPreferences = Effect.fn(
        "TaskMonitorStore.readMonitorPreferences"
      )(function* readMonitorPreferences(
        ownerId: string
      ): Effect.fn.Return<
        MonitorUserPreferences | null,
        TaskMonitorStoreError
      > {
        return yield* runTaskMonitorQuery(
          "TASK_MONITOR_SETTINGS_READ_FAILED",
          (client) =>
            client
              .from("user_settings")
              .select(
                "seeking, not_relevant, offer, areas, languages, app_locale"
              )
              .eq("user_id", ownerId)
              .maybeSingle()
        );
      });

      // Ends the scan run: a good scan or the reason it failed, which schedules
      // the retry (see finish_task_scan).
      const finishTaskScan = Effect.fn("TaskMonitorStore.finishTaskScan")(
        function* finishTaskScan(
          task: MonitoredTask,
          scanError: string | null
        ) {
          yield* runTaskMonitorQuery("TASK_MONITOR_FINISH_FAILED", (client) =>
            client.rpc("finish_task_scan", {
              scan_run_id: task.run_id,
              scan_error: scanError,
            })
          );
        }
      );

      // Gives the task back unscanned; it stays due.
      const releaseTaskScan = Effect.fn("TaskMonitorStore.releaseTaskScan")(
        function* releaseTaskScan(task: MonitoredTask) {
          yield* runTaskMonitorQuery("TASK_MONITOR_RELEASE_FAILED", (client) =>
            client.rpc("release_task_scan", { scan_run_id: task.run_id })
          );
        }
      );

      return TaskMonitorStore.of({
        claimDueTasks,
        renewTaskScanClaim,
        readMonitorPreferences,
        ...makeTaskMonitorScanWrites(runTaskMonitorQuery),
        ...makeTaskMonitorScanReads(runTaskMonitorQuery),
        finishTaskScan,
        releaseTaskScan,
      });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(SupabaseServiceDatabase.layer)
  );
}
