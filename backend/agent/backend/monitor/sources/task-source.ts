import { Context, Effect, Layer, Schema } from "effect";

import type { MonitoredTask } from "../scan/task-monitor-records";
import type { TaskMonitorBusyError } from "./task-monitor-busy-error";
import { TaskSourceError } from "./task-source-error";

// What a tracking task watches, and what each watch brings back.
//
// A task holds up to 10 sources (tracking_tasks.sources). A source is a kind
// and a query, plus filters that kind understands: { kind: "web", query:
// "accountants in Haifa" }, { kind: "crm-leads", query: "", filters: {
// stage: "new" } }. EXAMPLE kinds: you decide which kinds exist and what
// their filters mean; the monitor only passes them to TaskSourceReader.
//
// Every source brings back TaskItems: one card shape for anything a source
// finds (a lead, a listing, a ticket, a post). The monitor scores each new
// item against the task with Jev (task-post-scoring.ts), keeps every scored
// item's card (task_items), and records the matches (task_opportunities)
// with an alert. An item's id must be stable across scans: it is how the
// monitor knows an item is not new (task_scanned_items).

export const taskSourceSchema = Schema.Struct({
  kind: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/u)),
  query: Schema.String.check(Schema.isMaxLength(300)),
  filters: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
    )
  ),
});

/**
 * One thing a task watches: a kind of source, its query and its filters.
 */
export type TaskSource = typeof taskSourceSchema.Type;

export const taskSourcesSchema = Schema.Array(taskSourceSchema).check(
  Schema.isMaxLength(10)
);

const taskItemCommentSchema = Schema.Struct({
  id: Schema.String,
  text: Schema.NullOr(Schema.String),
  createdAt: Schema.NullOr(Schema.String),
  authorId: Schema.NullOr(Schema.String),
});

export const taskItemSchema = Schema.Struct({
  // Where it was found, the same for every item of one source: "web",
  // "crm-leads", "web:haifa". At most 60 characters.
  source: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_:-]{0,59}$/u)),
  // Stable across scans, unique within its source.
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  title: Schema.String,
  subtitle: Schema.NullOr(Schema.String),
  // The item's text, shortened.
  text: Schema.String,
  price: Schema.NullOr(Schema.Finite),
  place: Schema.NullOr(Schema.String),
  photoUrl: Schema.NullOr(Schema.String),
  url: Schema.String,
  // When it was written or listed, ISO; null when the source does not say.
  postedAt: Schema.NullOr(Schema.String),
  // Who wrote it, when the source knows: a repost by the same author is
  // kept as one match (task-match-repeats.ts).
  authorId: Schema.NullOr(Schema.String),
  // Replies under it, when the source has them: one may be the match.
  comments: Schema.Array(taskItemCommentSchema),
});

/**
 * Anything a source finds, as the task keeps it for its match's card.
 */
export type TaskItem = typeof taskItemSchema.Type;

/**
 * Reads what a source finds now: its first page of items, newest first.
 * The monitor gives the task too, for sources that read on its owner's
 * behalf (their account, their data).
 */
export class TaskSourceReader extends Context.Service<
  TaskSourceReader,
  {
    readonly read: (
      source: TaskSource,
      task: MonitoredTask
    ) => Effect.Effect<
      readonly TaskItem[],
      TaskSourceError | TaskMonitorBusyError
    >;
  }
>()("app/monitor/TaskSourceReader") {
  /**
   * EXAMPLE reader: every kind fails as not connected yet. Replace it with
   * a reader that dispatches on source.kind to your own clients (an API, a
   * database query, a scraper), each returning TaskItems.
   */
  static readonly exampleLayer = Layer.succeed(
    TaskSourceReader,
    TaskSourceReader.of({
      read: (source) =>
        Effect.fail(
          new TaskSourceError({
            code: "TASK_SOURCE_NOT_CONNECTED",
            detail: `no reader for source kind "${source.kind}" yet`,
          })
        ),
    })
  );
}
