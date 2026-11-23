import { Cause, Config, Effect, Layer, Metric, Option, Schedule } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import {
  startJourneyStopwatch,
  recordJourneyTiming,
} from "../../shared/observability/journey-timing";
import { TaskMonitorBusyError } from "../sources/task-monitor-busy-error";
import type { MonitoredTask } from "./task-monitor-records";
import { TaskMonitorStore } from "./task-monitor-store";
import {
  readTaskSources,
  scanTaskSources,
  taskClaimLeaseSeconds,
} from "./task-source-scan";

// The task monitor: in a background worker, it runs each active tracking
// task as often as its scan frequency says (the database decides when a
// task is due, retrying a failed scan with backoff). A scan reads each of
// the task's sources (task-source-scan.ts, through TaskSourceReader),
// scores the new items with AI, and records the matches (opportunities)
// with an in-app alert.
//
// Pace: one task at a time, ticks never overlap (the next starts a minute
// after the last one ends), and a source that needs a shared resource the
// user's own work holds gives the task back (TaskMonitorBusyError) to retry
// on the next tick. A scan scores at most 30 new items per source; the rest
// wait for the next scan.
// Workers claim due tasks with a lease (claim_due_tracking_tasks), so
// several workers never scan the same task and a crashed worker's tasks come
// back when the lease ends. Each source's results are written in one
// transaction, and every scan is logged in task_scan_runs.

const taskMonitorTickMs = 60_000;

// Finished task scans by outcome, for a dashboard and a failing-scans
// alert; a task given back unfinished is not a scan.
const taskMonitorScans = Metric.counter("task_monitor_scans", {
  description: "Task scans the monitor finished, by outcome",
  incremental: true,
});

// Claim only the task that starts now.
const taskClaimLimit = 1;

// One scan of one task; returns why it failed, or null.
const scanTrackingTask = Effect.fnUntraced(function* scanTrackingTask(
  task: MonitoredTask
) {
  const store = yield* TaskMonitorStore;

  const [sources, preferences] = yield* Effect.all(
    [readTaskSources(task), store.readMonitorPreferences(task.user_id)],
    { concurrency: "unbounded" }
  );

  if (sources.length === 0) {
    return "The task has no sources to scan. Add one to the task.";
  }

  const elapsed = yield* startJourneyStopwatch;
  const matches = yield* scanTaskSources(task, preferences, sources);

  yield* Effect.forkDetach(
    recordJourneyTiming({
      journey: "task-scan",
      ms: yield* elapsed,
      details: { sources: sources.length, matches },
    })
  );

  return null;
});

// Scans one task and records how it went (finish_task_scan schedules the
// retry of a failed scan). A busy shared resource fails the scan with
// TaskMonitorBusyError: the tick gives its tasks back unscanned.
const runTaskScan = Effect.fnUntraced(function* runTaskScan(
  task: MonitoredTask
) {
  const scanError = yield* scanTrackingTask(task).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.failCause(cause);
      }

      const error = Cause.squash(cause);

      if (error instanceof TaskMonitorBusyError) {
        return Effect.fail(error);
      }

      // The scan error the task shows: the failure's own message, or a
      // generic retry message for the monitor's database failures
      // (TASK_MONITOR_*).
      return Effect.logError("TASK_MONITOR_SCAN_FAILED", task.id, error).pipe(
        Effect.as(
          error instanceof Error && !error.message.startsWith("TASK_MONITOR_")
            ? error.message
            : "The scan failed. It will try again soon."
        )
      );
    })
  );

  const store = yield* TaskMonitorStore;
  yield* store.finishTaskScan(task, scanError);
  yield* Metric.update(
    Metric.withAttributes(taskMonitorScans, {
      outcome: scanError === null ? "succeeded" : "failed",
    }),
    1
  );
});

// One tick: claim due tasks and scan them one after another. When the
// user's own work takes a resource a scan needs, or the worker shuts down
// (interrupting the tick), the tasks not finished yet are given back and
// stay due. A tick never fails, so the next one always comes.
const runTaskMonitorTick = Effect.gen(function* runTaskMonitorTick() {
  const store = yield* TaskMonitorStore;
  const unfinished = new Set<MonitoredTask>();

  const markTaskFinished = (task: MonitoredTask) =>
    Effect.sync(() => {
      unfinished.delete(task);
    });

  yield* Effect.gen(function* scanDueTasks() {
    // Uninterruptible, so a claim that succeeds is always tracked for
    // giving back.
    const claimed = yield* store
      .claimDueTasks(taskClaimLeaseSeconds, taskClaimLimit)
      .pipe(
        Effect.tap((tasks) =>
          Effect.sync(() => {
            for (const task of tasks) {
              unfinished.add(task);
            }
          })
        ),
        Effect.uninterruptible
      );

    yield* effectForEach(
      claimed,
      (task) =>
        runTaskScan(task).pipe(Effect.tap(() => markTaskFinished(task))),
      { discard: true }
    );
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.failCause(cause);
      }

      const error = Cause.squash(cause);

      return error instanceof TaskMonitorBusyError
        ? Effect.void
        : Effect.logError("TASK_MONITOR_TICK_FAILED", error);
    }),
    // A claim that cannot be given back ends with its lease.
    Effect.ensuring(
      Effect.suspend(() =>
        effectForEach(
          [...unfinished],
          (task) => Effect.ignore(store.releaseTaskScan(task)),
          { concurrency: "unbounded", discard: true }
        )
      )
    )
  );
});

// The monitor: the first tick runs at once, then one a minute after each
// tick ends. Closing the layer's scope (worker shutdown) interrupts the
// running tick, which gives its tasks back. Set TASK_MONITOR=off to run the
// worker without it. The worker entry provides its services
// (TaskMonitorStore, TaskSourceReader, JevClient, OpenAiResponses,
// JourneyTimingLog; task-worker.ts).
export const taskMonitorLayer = Layer.effectDiscard(
  Effect.gen(function* startTaskMonitor() {
    const setting = yield* Effect.orDie(
      Config.option(Config.String("TASK_MONITOR"))
    );

    if (Option.contains(setting, "off")) {
      yield* Effect.logInfo("Task monitor is off (TASK_MONITOR=off).");

      return;
    }

    yield* runTaskMonitorTick.pipe(
      Effect.repeat(Schedule.spaced(taskMonitorTickMs)),
      Effect.forkScoped
    );
    yield* Effect.logInfo("Task monitor checks active tasks every minute.");
  })
);
