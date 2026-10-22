import { DateTime, Effect, Option, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { describeTaskMatches } from "../scoring/task-match-description";
import {
  dropRepeatedTaskMatches,
  taskRepeatWindowDays,
} from "../scoring/task-match-repeats";
import {
  scoreTaskPosts,
  taskMatchMinScore,
} from "../scoring/task-post-scoring";
import type { TaskScoredPost } from "../scoring/task-scored-post";
import { TaskSourceReader, taskSourcesSchema } from "../sources/task-source";
import type { TaskItem, TaskSource } from "../sources/task-source";
import { TaskSourceError } from "../sources/task-source-error";
import type {
  MonitoredTask,
  MonitorUserPreferences,
  TaskOpportunityInput,
} from "./task-monitor-records";
import { TaskMonitorStore } from "./task-monitor-store";

// A task's sources, in one scan (task-monitor.ts): each source's first page,
// the items the task has not scored yet scored with Jev, the repeats of
// earlier matches dropped, the matches described by the LLM, and all of it
// recorded in one transaction per source with an alert per new match
// (record_task_source_scan). A source that fails (down, refused, changed)
// is logged and skipped; the next scan tries it again. A shared resource
// taken by the user's own work (TaskMonitorBusyError) stops the scan, and
// the task is given back unscanned.

// A claimed task's lease; renewed before reading and scoring each source.
export const taskClaimLeaseSeconds = 15 * 60;

// New items scored per source per scan; the rest are scored next scan.
const taskSourceScanItemLimit = 30;

// One source's first page; a source's failure is logged and leaves it out
// this scan.
const readTaskSourceItems = (source: TaskSource, task: MonitoredTask) =>
  Effect.gen(function* readTaskSourceItemsNow() {
    const reader = yield* TaskSourceReader;

    return yield* reader.read(source, task);
  }).pipe(
    Effect.catchIf(
      (failure): failure is TaskSourceError =>
        failure instanceof TaskSourceError,
      (failure) =>
        Effect.logWarning(
          `TASK_SOURCE_SCAN_SKIPPED ${source.kind}`,
          failure.message
        ).pipe(Effect.as([]))
    )
  );

// What the scorer reads of an item. Its id names the source too: two sources
// may share an item id.
const taskSourceScoredPost = (item: TaskItem): TaskScoredPost => ({
  id: `${item.source}|${item.id}`,
  text: [
    item.title,
    item.subtitle,
    item.price === null ? null : String(item.price),
    item.place,
    item.text,
  ]
    .filter(Boolean)
    .join("\n"),
  createdAt: Option.getOrNull(
    Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)(item.postedAt)
  )
    ? item.postedAt
    : null,
  authorId: item.authorId,
  attachments: [],
  comments: item.comments,
});

// The name scoring reads as the item's source: its kind and query, so an
// item that names no place is judged by the source's.
const taskSourceLabel = (source: TaskSource) =>
  [source.kind, source.query].filter(Boolean).join(" ");

const scanTaskSource = Effect.fnUntraced(function* scanTaskSource(
  task: MonitoredTask,
  preferences: MonitorUserPreferences | null,
  source: TaskSource
) {
  const store = yield* TaskMonitorStore;
  yield* store.renewTaskScanClaim(task, taskClaimLeaseSeconds);
  const items = yield* readTaskSourceItems(source, task);
  const itemSources = [...new Set(items.map((item) => item.source))];

  const scanned = new Map(
    yield* effectForEach(itemSources, (itemSource) =>
      store
        .readScannedItemKeys(task.id, itemSource)
        .pipe(Effect.map((keys) => [itemSource, keys] as const))
    )
  );

  const seen = new Set<string>();

  const fresh = items
    .filter((item) => {
      const key = `${item.source}|${item.id}`;

      if (seen.has(key) || scanned.get(item.source)?.has(item.id) === true) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .slice(0, taskSourceScanItemLimit);

  if (fresh.length === 0) {
    return 0;
  }

  yield* store.renewTaskScanClaim(task, taskClaimLeaseSeconds);
  const posts = fresh.map(taskSourceScoredPost);

  const scores = yield* scoreTaskPosts(
    task,
    preferences,
    { name: taskSourceLabel(source) },
    posts
  );

  const byKey = new Map(
    fresh.map((item) => [`${item.source}|${item.id}`, item])
  );

  const postsByKey = new Map(posts.map((post) => [post.id, post]));

  const candidates = scores.flatMap((score) => {
    const post = postsByKey.get(score.postId);
    const item = byKey.get(score.postId);

    return post && item && score.score >= taskMatchMinScore
      ? [
          {
            post,
            source: item.source,
            commentId: score.commentId,
            score: score.score,
          },
        ]
      : [];
  });

  // A repost of a match from the last week (or of one earlier in this scan)
  // by the same author is not a second opportunity.
  const since = DateTime.formatIso(
    DateTime.subtract(yield* DateTime.now, { days: taskRepeatWindowDays })
  );

  const { kept: matches } = yield* dropRepeatedTaskMatches(
    candidates,
    yield* store.readEarlierTaskMatches(task, since)
  );

  const descriptions = new Map(
    (yield* describeTaskMatches(task, preferences, matches)).map(
      (description) => [description.postId, description]
    )
  );

  const opportunities: TaskOpportunityInput[] = matches.flatMap(
    ({ post, commentId, score }) => {
      const item = byKey.get(post.id);
      const description = descriptions.get(post.id);

      return item
        ? [
            {
              source: item.source,
              itemId: item.id,
              commentId: commentId ?? "",
              score,
              intent: description?.intent ?? "",
              reason: description?.reason ?? "",
              postedAt: post.createdAt,
            },
          ]
        : [];
    }
  );

  yield* store.recordTaskSourceScan(
    task,
    fresh,
    scores.flatMap((score) => {
      const item = byKey.get(score.postId);

      return item
        ? [
            {
              source: item.source,
              itemId: item.id,
              score: score.score,
              jevAnswers: score.jevAnswers,
            },
          ]
        : [];
    }),
    opportunities
  );

  return opportunities.length;
});

/**
 * The task's sources, as stored; a list that no longer decodes is left out
 * (and logged), so one bad task never stops the others.
 */
export const readTaskSources = Effect.fnUntraced(function* readTaskSources(
  task: MonitoredTask
) {
  const decoded = Schema.decodeUnknownOption(taskSourcesSchema)(task.sources);

  if (Option.isNone(decoded)) {
    yield* Effect.logWarning("TASK_SOURCES_INVALID", task.id);

    return [];
  }

  return decoded.value;
});

/**
 * Every source of the task, one after another; returns the new matches.
 */
export const scanTaskSources = Effect.fnUntraced(function* scanTaskSources(
  task: MonitoredTask,
  preferences: MonitorUserPreferences | null,
  sources: readonly TaskSource[]
) {
  const matches = yield* effectForEach(sources, (source) =>
    scanTaskSource(task, preferences, source)
  );

  return matches.reduce((sum, count) => sum + count, 0);
});
