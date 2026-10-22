import { pathToFileURL } from "node:url";

import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";

import { taskMonitorLayer } from "../monitor/scan/task-monitor";
import { TaskMonitorStore } from "../monitor/scan/task-monitor-store";
import { TaskSourceReader } from "../monitor/sources/task-source";
import { OpenAiResponses } from "../shared/ai/openai-response";
import { JevClient } from "../shared/ai/typesafe-jev-client";
import { appObservabilityLive } from "../shared/observability/app-observability";
import { JourneyTimingLog } from "../shared/observability/journey-timing";

// The background worker: one long-running process that scans every user's
// due tracking tasks (task-monitor.ts). Run it beside the web app, never
// inside a request: `npm run worker:tasks` (in backend/agent). Several copies may
// run at once; each claims different tasks (claim_due_tracking_tasks).
// Replace TaskSourceReader.exampleLayer with your own sources
// (task-source.ts).
const taskWorkerServicesLive = Layer.mergeAll(
  TaskMonitorStore.layer,
  TaskSourceReader.exampleLayer,
  JevClient.layer,
  OpenAiResponses.layer,
  JourneyTimingLog.layer
);

export const TaskWorkerLive = taskMonitorLayer.pipe(
  Layer.provide(taskWorkerServicesLive),
  Layer.provide(appObservabilityLive("app-worker"))
);

const [entryFile] = process.argv.slice(1);

if (entryFile && pathToFileURL(entryFile).href === import.meta.url) {
  NodeRuntime.runMain(Layer.launch(TaskWorkerLive));
}
