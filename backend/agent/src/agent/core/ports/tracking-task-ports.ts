import type { Effect } from "effect";

import type {
  TaskOpportunity,
  TaskOpportunityStatus,
} from "@/lib/opportunities/task-opportunity-schema";
import type {
  TrackingTask,
  TrackingTaskScanRun,
} from "@/lib/tasks/tracking-task-schema";

// The ports the agent's task and opportunity tools work through
// (src/agent/tools/tasks). The chat endpoint gives them the user's own
// tables (agent-ports.server.ts, over tracking-task-storage.server.ts and
// task-opportunity-storage.server.ts, the same storage as the tasks and
// opportunities pages); the agent evals give them an in-memory store
// (tests/evals/agent/harness), so no eval reaches the database.

/**
 * The user's tracking tasks (tracking_tasks).
 */
export interface TrackingTaskStore {
  // In the board's manual order.
  list: () => Effect.Effect<TrackingTask[], Error>;
  get: (taskId: string) => Effect.Effect<TrackingTask | null, Error>;
  // At this place on the board.
  insert: (task: TrackingTask, position: number) => Effect.Effect<void, Error>;
  // Only over the version it was made from (TRACKING_TASK_CHANGED).
  update: (task: TrackingTask) => Effect.Effect<void, Error>;
  // How many went.
  delete: (taskIds: readonly string[]) => Effect.Effect<number, Error>;
  // Whether the task is active, so the monitor scans it within a minute.
  requestScan: (taskId: string) => Effect.Effect<boolean, Error>;
  // Newest first; every task's when taskId is null.
  scanRuns: (query: {
    taskId: string | null;
    limit: number;
  }) => Effect.Effect<(TrackingTaskScanRun & { taskId: string })[], Error>;
}

/**
 * What the user's tasks found (task_opportunities).
 */
export interface TaskOpportunityStore {
  list: (filters: {
    taskId: string | null;
    statuses: readonly TaskOpportunityStatus[];
    minScore: number;
    page: number;
  }) => Effect.Effect<
    { opportunities: TaskOpportunity[]; hasMore: boolean },
    Error
  >;
  // How many changed.
  changeStatus: (
    opportunityIds: readonly string[],
    status: TaskOpportunityStatus
  ) => Effect.Effect<number, Error>;
}
