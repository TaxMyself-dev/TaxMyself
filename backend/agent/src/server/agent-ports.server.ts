import { Effect } from "effect";

import type { EmailSender, WebSearch } from "@/agent/core/ports/example-ports";
import type { KeepInTaxBooks } from "@/agent/core/ports/keepintax-ports";
import type {
  TaskOpportunityStore,
  TrackingTaskStore,
} from "@/agent/core/ports/tracking-task-ports";
import { currentAgentDomain } from "@/server/runtime/agent-request-context";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import {
  changeStoredTaskOpportunityStatus,
  readStoredTaskOpportunities,
} from "@/server/tasks/task-opportunity-storage.server";
import {
  deleteStoredTrackingTasks,
  insertStoredTrackingTask,
  readStoredTaskScanRuns,
  readStoredTrackingTask,
  readStoredTrackingTasks,
  requestStoredTrackingTaskScan,
  updateStoredTrackingTask,
} from "@/server/tasks/tracking-task-storage.server";

// The real implementations of the agent's ports (example-ports.ts,
// tracking-task-ports.ts), built
// per request with the signed-in user's database client, so RLS keeps every
// tool to the user's own rows. EXAMPLE: replace each with your domain's
// services; keep the shape (an Effect that fails with an Error whose message
// starts with a CODE: that agent-tool-error-next-step.ts gives a next step).

/**
 * The user's tracking tasks, through the tasks page's own storage.
 *
 * @param supabase - The signed-in user's client.
 * @returns The task store.
 */
export const createTrackingTaskStore = (
  supabase: UserSupabaseClient
): TrackingTaskStore => ({
  list: () => readStoredTrackingTasks(supabase),
  get: (taskId) => readStoredTrackingTask(supabase, taskId),
  insert: (task, position) =>
    insertStoredTrackingTask(supabase, task, position),
  update: (task) => updateStoredTrackingTask(supabase, task),
  delete: (taskIds) => deleteStoredTrackingTasks(supabase, taskIds),
  requestScan: (taskId) => requestStoredTrackingTaskScan(supabase, taskId),
  scanRuns: (query) => readStoredTaskScanRuns(supabase, query),
});

/**
 * The opportunities the user's tasks found, through the opportunities
 * page's own storage.
 *
 * @param supabase - The signed-in user's client.
 * @returns The opportunity store.
 */
export const createTaskOpportunityStore = (
  supabase: UserSupabaseClient
): TaskOpportunityStore => ({
  list: (filters) => readStoredTaskOpportunities(supabase, filters),
  changeStatus: (opportunityIds, status) =>
    changeStoredTaskOpportunityStatus(supabase, opportunityIds, status),
});

/**
 * The web search the agent's searchWeb uses. EXAMPLE: connect your search
 * provider here (report progress with onProgress as results arrive).
 */
export const webSearch: WebSearch = {
  search: () =>
    // The ports fail with an Error whose message starts with its CODE:
    // (example-ports.ts), which agent-tool-error-next-step.ts reads.
    Effect.fail(
      // @effect-diagnostics-next-line globalErrorInEffectFailure:off
      new Error("WEB_SEARCH_UNAVAILABLE: no search provider is connected yet")
    ),
};

/**
 * The email sender the agent's sendEmail uses. EXAMPLE: connect your email
 * provider here; make the send idempotent (a retried call must not send
 * twice).
 */
export const emailSender: EmailSender = {
  send: () =>
    Effect.fail(
      // @effect-diagnostics-next-line globalErrorInEffectFailure:off
      new Error("EMAIL_OUTCOME_UNKNOWN: no email provider is connected yet")
    ),
};

// A KeepInTax failure keeps its CODE: (the domain's own); anything else
// (a thrown Nest exception, a lost connection) is the books being
// unavailable, which the model reads with a next step.
const keepInTaxFailure = (message: string) =>
  new Error(
    /^[A-Z][A-Z0-9_]+:/u.test(message)
      ? message
      : `BOOKS_UNAVAILABLE: ${message}`
  );

/**
 * The user's books, through KeepInTax's domain the Nest backend gave this
 * request (already bound to the verified user and their data owner). Outside
 * the backend (the task worker) there is none, and every query fails with
 * BOOKS_UNAVAILABLE.
 *
 * @returns The books port.
 */
export const createKeepInTaxBooks = (): KeepInTaxBooks => {
  const domain = currentAgentDomain();

  if (domain === undefined) {
    return {
      queryExpenses: () =>
        Effect.fail(
          keepInTaxFailure("the agent runs without KeepInTax's backend")
        ),
    };
  }

  return {
    queryExpenses: (query) =>
      // The ports' contract: an Error whose message starts with its CODE:
      // (keepintax-ports.ts).
      // @effect-diagnostics-next-line globalErrorInEffectCatch:off
      Effect.tryPromise({
        try: async () => await domain.queryExpenses(query),
        catch: (error) =>
          keepInTaxFailure(
            error instanceof Error ? error.message : String(error)
          ),
      }),
  };
};
