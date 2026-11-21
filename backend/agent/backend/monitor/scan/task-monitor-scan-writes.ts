import { Effect } from "effect";

import type { TaskItem } from "../sources/task-source";
import type { TaskMonitorQuery } from "./task-monitor-query";
import type {
  MonitoredTask,
  TaskOpportunityInput,
  TaskPostScore,
} from "./task-monitor-records";

/**
 * TaskMonitorStore's write of a scan's items, scores and matches
 * (task-monitor-store.ts).
 *
 * @param runTaskMonitorQuery - Runs one query with the monitor's error code.
 * @returns The store's write operations.
 */
export const makeTaskMonitorScanWrites = (
  runTaskMonitorQuery: TaskMonitorQuery
) => {
  // Records one source's items, their scores, the matches and their
  // notifications in one transaction (see record_task_source_scan).
  const recordTaskSourceScan = Effect.fn(
    "TaskMonitorStore.recordTaskSourceScan"
  )(function* recordTaskSourceScan(
    task: MonitoredTask,
    items: readonly TaskItem[],
    scores: TaskPostScore[],
    opportunities: TaskOpportunityInput[]
  ) {
    yield* runTaskMonitorQuery("TASK_MONITOR_SCAN_WRITE_FAILED", (client) =>
      client.rpc("record_task_source_scan", {
        scan_run_id: task.run_id,
        items: items.map((item) => ({
          source: item.source,
          itemId: item.id,
          snapshot: item,
        })),
        scores: scores.map(({ source, itemId, score, jevAnswers }) => ({
          source,
          itemId,
          score,
          jevAnswers,
        })),
        opportunities: opportunities.map((opportunity) => ({
          source: opportunity.source,
          itemId: opportunity.itemId,
          commentId: opportunity.commentId,
          score: opportunity.score,
          intent: opportunity.intent,
          reason: opportunity.reason,
          postedAt: opportunity.postedAt,
        })),
      })
    );
  });

  return { recordTaskSourceScan };
};
