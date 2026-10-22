import { tool } from "ai";
import { Effect, Schema, Struct } from "effect";

import {
  newTrackingTask,
  trackingTaskSchema,
  trackingTaskStatuses,
} from "@/lib/tasks/tracking-task-schema";
import type { TrackingTask } from "@/lib/tasks/tracking-task-schema";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";
import { agentToolUuid } from "../../core/tool-runtime/agent-tool-uuid";

// The agent's tools for the user's tracking tasks. They write
// through the same storage as the tasks page, so the board and the agent
// always agree.

// The fields the agent sets on a task; the rest belong to the monitor and
// the database.
// Fields left out are optional keys (Schema.optionalKey): a JSON Schema
// optional field may be absent, never null.
const trackingTaskFieldsSchema = Schema.Struct({
  sentence: trackingTaskSchema.fields.sentence.annotate({
    description: "What to find, in one sentence in the user's language",
  }),
  details: trackingTaskSchema.fields.details.annotate({
    description: "What matters and what does not, in the user's words",
  }),
  location: trackingTaskSchema.fields.location.annotate({
    description:
      "Where, in the user's words (\"Haifa and around\"); left out, the user's areas",
  }),
  budget: trackingTaskSchema.fields.budget.annotate({
    description:
      'The price range or budget in the user\'s words ("up to $2,000")',
  }),
  status: trackingTaskSchema.fields.status.annotate({
    description:
      "active: scans on its frequency (the default). suggested: waits in Suggestions. paused: kept, not scanning (stops a task without deleting it). finished: its goal was reached",
  }),
  priority: trackingTaskSchema.fields.priority.annotate({
    description: "How urgent the task is to the user; none when left out",
  }),
  labels: trackingTaskSchema.fields.labels.annotate({
    description:
      "Short labels the user sorts tasks by. The whole list is replaced, so include the labels that stay",
  }),
  // EXAMPLE kinds: describe your source kinds and their filters here, the
  // same ones your TaskSourceReader reads (task-source.ts).
  sources: trackingTaskSchema.fields.sources.annotate({
    description:
      'What the task reads every scan (up to 10): {kind, query, filters?}. Kinds: "web" (query: what to search the web for). The whole list is replaced: include the sources that stay',
  }),
  scanFrequency: trackingTaskSchema.fields.scanFrequency.annotate({
    description:
      "How often it scans; left out, the user's scan frequency. realtime: every 2 minutes",
  }),
  alerts: trackingTaskSchema.fields.alerts.annotate({
    description: "An in-app alert when a match is found",
  }),
});

const trackingTaskUuid = agentToolUuid;

// A task change the agent asked for that cannot be made. Its message,
// `<CODE>: <detail>` (TRACKING_TASK_NOT_FOUND: …), is the tool error the
// model reads.
class AgentTrackingTaskError extends Schema.TaggedError<
  AgentTrackingTaskError,
  { readonly brand: unique symbol }
>()("AgentTrackingTaskError", { code: Schema.String, detail: Schema.String }) {
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}

// What the model sees of a task.
const agentTrackingTaskView = (task: TrackingTask) => ({
  id: task.id,
  sentence: task.sentence,
  details: task.details,
  location: task.location,
  budget: task.budget,
  status: task.status,
  priority: task.priority,
  labels: task.labels,
  sources: task.sources,
  scanFrequency: task.scanFrequency,
  alerts: task.alerts,
  createdAt: task.createdAt,
  lastScannedAt: task.lastScannedAt,
  lastScanError: task.lastScanError,
});

export const listTrackingTasksTool = tool({
  description:
    "List the user's tracking tasks in board order, with each one's id, fields and last scan. Call it before changing a task, to find the one the user means, and when they ask about their tasks. The chat shows them as cards.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      statuses: Schema.optionalKey(
        Schema.Array(Schema.Literals(trackingTaskStatuses))
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ statuses }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      context.tasks.list().pipe(
        Effect.map((tasks) => {
          const wanted = statuses ? new Set(statuses) : null;

          return tasks.flatMap((task) =>
            !wanted || wanted.has(task.status)
              ? [agentTrackingTaskView(task)]
              : []
          );
        })
      ),
      { signal: abortSignal }
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});

export const createTrackingTaskTool = tool({
  description:
    "Create a tracking task: a saved search that keeps scanning its sources on its scan frequency until paused, and records each match as an opportunity. Only for ongoing tracking or alerts, after the user agreed to the setup (sources, frequency, alerts) or said to go with the defaults; for ideas use suggestTrackingTasks. Defaults: active (scans at once), no priority, the user's scan frequency. Returns the task with its id.",
  inputSchema: toStandardSchema(
    trackingTaskFieldsSchema.mapFields(
      Struct.mapOmit(["sentence"], Schema.optionalKey)
    )
  ),
  contextSchema: agentToolContextSchema,
  execute: async (fields, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* createTrackingTask() {
        const tasks = yield* context.tasks.list();

        const task: TrackingTask = {
          ...newTrackingTask(fields.sentence, {
            scanFrequency: context.settings.automation.scanFrequency,
          }),
          ...fields,
        };

        // At the end of the board, as a task added on the tasks page.
        yield* context.tasks.insert(task, tasks.length);

        return agentTrackingTaskView(task);
      }),
      { signal: abortSignal }
    ),
});

export const updateTrackingTaskTool = tool({
  description:
    "Change fields of one tracking task (its id from listTrackingTasks; ask which when several could match); fields left out stay. sources and labels are replaced whole, so include what stays. To stop a task without losing it, set status to paused. Returns the task. TRACKING_TASK_NOT_FOUND: list the tasks again.",
  // The fields come without their descriptions, which createTrackingTask
  // already gives the model on every request.
  inputSchema: toStandardSchema(
    Schema.Struct({
      taskId: trackingTaskUuid,
      changes: Schema.Struct(
        Struct.map(
          Struct.pick(
            trackingTaskSchema.fields,
            Struct.keys(trackingTaskFieldsSchema.fields)
          ),
          Schema.optionalKey
        )
      ).annotate({
        description:
          "The fields to change, as createTrackingTask describes them",
      }),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ taskId, changes }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* updateTrackingTask() {
        const task = yield* context.tasks.get(taskId);

        if (!task) {
          return yield* new AgentTrackingTaskError({
            code: "TRACKING_TASK_NOT_FOUND",
            detail: "no task with this id",
          });
        }

        const changed = { ...task, ...changes };
        yield* context.tasks.update(changed);

        return agentTrackingTaskView(changed);
      }),
      { signal: abortSignal }
    ),
});

// Asks the user first (see appAgent's toolApproval).
export const deleteTrackingTasksTool = tool({
  description:
    "Delete tracking tasks for good, together with all their opportunities; they cannot be restored. Use it when the user asks to delete tasks; when they only want a task to stop scanning, set it to paused with updateTrackingTask instead. Take the ids from listTrackingTasks. The user approves in a card that names each task, so call it as soon as you know which tasks, without asking in text first. If the user denies it, the tasks stay. Returns how many were deleted.",
  // The approval card shows the tasks these ids name, looked up from the
  // user's own tasks, so it shows what will really be deleted.
  inputSchema: toStandardSchema(
    Schema.Struct({
      taskIds: Schema.Array(trackingTaskUuid).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(50)
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ taskIds }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      context.tasks
        .delete(taskIds)
        .pipe(Effect.map((deleted) => ({ deleted }))),
      { signal: abortSignal }
    ),
});

// "Scan now": the monitor picks the task up within a minute while the
// background worker runs.
export const scanTrackingTaskNowTool = tool({
  description:
    "Ask the monitor to scan one active tracking task now instead of waiting for its scan frequency (task id from listTrackingTasks). New matches appear in Opportunities within minutes: check them later with listTaskOpportunities, or listRecentScans to see how the scan went.",
  inputSchema: toStandardSchema(Schema.Struct({ taskId: trackingTaskUuid })),
  contextSchema: agentToolContextSchema,
  execute: async ({ taskId }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      context.tasks
        .requestScan(taskId)
        .pipe(Effect.map((requested) => ({ requested }))),
      { signal: abortSignal }
    ),
});

// What the monitor did lately: each scan with its task, when it ran, how many
// sources and new items it read, how many matches it found, and why it failed.
export const listRecentScansTool = tool({
  description:
    "List the monitor's 10 latest scans, newest first: for one task, or for all tasks. Each shows its task, when it ran, the sources and new items it read, the matches it found and why it failed. Use it when the user asks what happened, what was scanned, or why nothing was found.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      taskId: Schema.NullOr(trackingTaskUuid)
        .annotate({
          default: null,
          description:
            "One task's id from listTrackingTasks, or null for every task",
        })
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ taskId }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.all(
        [context.tasks.scanRuns({ taskId, limit: 10 }), context.tasks.list()],
        { concurrency: "unbounded" }
      ).pipe(
        Effect.map(([runs, tasks]) => {
          const sentences = new Map(
            tasks.map((task) => [task.id, task.sentence])
          );

          return runs.map((run) => ({
            ...run,
            task: sentences.get(run.taskId) ?? null,
          }));
        })
      ),
      { signal: abortSignal }
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});
