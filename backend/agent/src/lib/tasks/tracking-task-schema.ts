import { Schema } from "effect";

import { taskSourcesSchema } from "../../../backend/monitor/sources/task-source";

// Tracking tasks: standing searches, such as "apartments in Haifa", that
// run in the background. One sentence is a whole task; the other fields hold
// only what the user knows and the AI cannot work out, and an empty one
// inherits the user's preferences. Stored in tracking_tasks; the background
// worker's monitor (backend/monitor) scans the active ones.
//
// Deliberately not task settings, because the system decides them from the
// sentence: the task type, how far back the first scan looks, and a match
// score threshold (the AI's score ranks results instead). The sources are
// what the agent sets up from the sentence
// (backend/monitor/sources/task-source.ts).

// "realtime" scans as often as the monitor allows (every 2 minutes).
export const trackingTaskScanFrequencies = [
  "realtime",
  "5m",
  "15m",
  "hour",
  "6h",
  "day",
] as const;

// A task's stage, in board order: suggested (by the agent, not running yet),
// active (scanning), paused, and finished (its goal reached).
export const trackingTaskStatuses = [
  "suggested",
  "active",
  "paused",
  "finished",
] as const;

// The priorities, most urgent first.
export const trackingTaskPriorities = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const;

export const trackingTaskLabelMaxLength = 50;

export const trackingTaskSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  // The task in one sentence; the system turns it into searches.
  sentence: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
  // What matters in this task and what does not, in the user's words.
  details: Schema.String.check(Schema.isMaxLength(1000)),
  location: Schema.String.check(Schema.isMaxLength(200)),
  budget: Schema.String.check(Schema.isMaxLength(100)),
  // What the monitor reads each scan (task-source.ts).
  sources: taskSourcesSchema,
  scanFrequency: Schema.Literals(trackingTaskScanFrequencies),
  // An in-app alert when a match is found.
  alerts: Schema.Boolean,
  status: Schema.Literals(trackingTaskStatuses),
  priority: Schema.Literals(trackingTaskPriorities),
  labels: Schema.Array(
    Schema.String.check(Schema.isMaxLength(trackingTaskLabelMaxLength))
  ).check(Schema.isMaxLength(20)),
  createdAt: Schema.String,
  // Written by the monitor: when the task last scanned, and why the last
  // scan failed (null after a good scan).
  lastScannedAt: Schema.NullOr(Schema.String),
  lastScanError: Schema.NullOr(Schema.String),
  // Bumped by every saved change; an edit saves only over the version it
  // was made from (see updateStoredTrackingTask).
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

/**
 * A tracking task: what it is after, where it looks (its sources), how often
 * it runs, its place on the board, and its last scan.
 */
export type TrackingTask = typeof trackingTaskSchema.Type;

// Prefix of the error an edit gets when its task changed since it was read
// (see updateStoredTrackingTask).
export const trackingTaskChangedError = "TRACKING_TASK_CHANGED";

/**
 * Where a task stands on the board: suggested, active, paused or finished.
 */
export type TrackingTaskStatus = TrackingTask["status"];

/**
 * A task's priority, from none to urgent.
 */
export type TrackingTaskPriority = TrackingTask["priority"];

// The settings a new task starts with: the user's default scan frequency.
type TrackingTaskDefaults = Pick<TrackingTask, "scanFrequency">;

/**
 * A new task runs at once unless it is given another status, such as an
 * agent suggestion waiting in Suggestions.
 *
 * @param sentence - What the task is after, in one sentence.
 * @param defaults - The user's default for new tasks: their scan frequency.
 * @param fields - The fields set from the start: details, place, status,
 *   priority and labels.
 * @returns The task, created now, never scanned.
 */
export const newTrackingTask = (
  sentence: string,
  defaults: TrackingTaskDefaults,
  fields: Partial<
    Pick<
      TrackingTask,
      "details" | "location" | "status" | "priority" | "labels"
    >
  > = {}
): TrackingTask => ({
  id: crypto.randomUUID(),
  sentence,
  details: "",
  location: "",
  budget: "",
  sources: [],
  ...defaults,
  alerts: true,
  status: "active",
  priority: "none",
  labels: [],
  ...fields,
  createdAt: new Date().toISOString(),
  lastScannedAt: null,
  lastScanError: null,
  version: 0,
});

// One scan of a task by the monitor (task_scan_runs).
export const trackingTaskScanRunSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  status: Schema.Literals(["running", "succeeded", "failed", "skipped"]),
  sourcesScanned: Schema.Int,
  itemsScored: Schema.Int,
  matches: Schema.Int,
  error: Schema.NullOr(Schema.String),
  startedAt: Schema.String,
  finishedAt: Schema.NullOr(Schema.String),
});

/**
 * One scan of a task by the monitor: how it ended, how many sources, scored
 * items and matches, its error, and when it ran.
 */
export type TrackingTaskScanRun = typeof trackingTaskScanRunSchema.Type;
