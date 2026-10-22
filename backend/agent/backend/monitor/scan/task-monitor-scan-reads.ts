import { Effect, Option, Schema } from "effect";

import { isNonEmptyText } from "../../shared/text/non-empty-text";
import { taskItemSchema } from "../sources/task-source";
import type { TaskMonitorQuery } from "./task-monitor-query";
import type { EarlierTaskMatch, MonitoredTask } from "./task-monitor-records";
import type { TaskMonitorStoreError } from "./task-monitor-store-error";

/**
 * TaskMonitorStore's reads of what a task already found and scored
 * (task-monitor-store.ts).
 *
 * @param runTaskMonitorQuery - Runs one query with the monitor's error code.
 * @returns The store's read operations.
 */
export const makeTaskMonitorScanReads = (
  runTaskMonitorQuery: TaskMonitorQuery
) => {
  // The task's opportunities found since `since`, with the author and text of
  // the item or reply each one is.
  const readEarlierTaskMatches = Effect.fn(
    "TaskMonitorStore.readEarlierTaskMatches"
  )(function* readEarlierTaskMatches(
    task: MonitoredTask,
    since: string
  ): Effect.fn.Return<EarlierTaskMatch[], TaskMonitorStoreError> {
    const opportunities = yield* runTaskMonitorQuery(
      "TASK_MONITOR_OPPORTUNITIES_READ_FAILED",
      (client) =>
        client
          .from("task_opportunities")
          .select("source, item_id, comment_id")
          .eq("task_id", task.id)
          .gte("found_at", since)
          .limit(500)
    );

    if (opportunities.length === 0) {
      return [];
    }

    const items = yield* runTaskMonitorQuery(
      "TASK_MONITOR_ITEMS_READ_FAILED",
      (client) =>
        client
          .from("task_items")
          .select("source, item_id, snapshot")
          .eq("user_id", task.user_id)
          .in(
            "item_id",
            opportunities.map((opportunity) => opportunity.item_id)
          )
    );

    const snapshots = new Map(
      items.map((row) => [
        `${row.source}:${row.item_id}`,
        Option.getOrNull(
          Schema.decodeUnknownOption(taskItemSchema)(row.snapshot)
        ),
      ])
    );

    return opportunities.flatMap((opportunity) => {
      const item = snapshots.get(
        `${opportunity.source}:${opportunity.item_id}`
      );

      if (!item) {
        return [];
      }

      const comment = item.comments.find(
        (reply) => reply.id === opportunity.comment_id
      );

      const authorId = comment ? comment.authorId : item.authorId;
      const text = (comment ? comment.text : item.text) ?? "";

      return isNonEmptyText(authorId)
        ? [{ source: item.source, itemId: item.id, authorId, text }]
        : [];
    });
  });

  // The items of this source the task has already scored. Reads the next
  // page only after a full page.
  const readScannedItemKeys = Effect.fn("TaskMonitorStore.readScannedItemKeys")(
    function* readScannedItemKeys(taskId: string, source: string) {
      const scanned = new Set<string>();

      for (let offset = 0; ; offset += 1000) {
        const data = yield* runTaskMonitorQuery(
          "TASK_MONITOR_SCANNED_READ_FAILED",
          (client) =>
            client
              .from("task_scanned_items")
              .select("item_id")
              .eq("task_id", taskId)
              .eq("source", source)
              .order("item_id")
              .range(offset, offset + 999)
        );

        for (const row of data) {
          scanned.add(row.item_id);
        }

        if (data.length < 1000) {
          return scanned;
        }
      }
    }
  );

  return { readEarlierTaskMatches, readScannedItemKeys };
};
